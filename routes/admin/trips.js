import express from 'express';
import pool from '../../db.js';
import { authenticateToken } from '../../middleware/authorization.js';
import multer from 'multer';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const router = express.Router();

// Configure multer for file uploads (memory storage for S3)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Configure S3 client
const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const randomImageName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

// GET /api/admin/trips - Get all trips with pagination
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Get pagination parameters from query string
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const search = req.query.search;

        // Build WHERE clause for search
        const whereClause = search ? `WHERE destination_name ILIKE $1` : '';
        const searchParam = search ? `%${search}%` : null;

        // Get total count of trips
        const countQuery = `SELECT COUNT(*) as total FROM trips ${whereClause}`;
        const countResult = search 
            ? await pool.query(countQuery, [searchParam])
            : await pool.query(countQuery);
        const totalCount = parseInt(countResult.rows[0].total);

        // Fetch paginated trips with earliest and latest batch dates
        const query = `
            SELECT 
                t.*,
                date_agg.earliest_from_date AS from_month,
                date_agg.latest_to_date AS to_month
            FROM trips t
            LEFT JOIN (
                SELECT 
                    trip_id,
                    MIN(from_date) AS earliest_from_date,
                    MAX(to_date) AS latest_to_date
                FROM batches
                GROUP BY trip_id
            ) date_agg ON date_agg.trip_id = t.id
            ${whereClause}
            ORDER BY t.destination_name
            LIMIT $${search ? 2 : 1} OFFSET $${search ? 3 : 2};
        `;

        const result = search
            ? await pool.query(query, [searchParam, limit, offset])
            : await pool.query(query, [limit, offset]);
        
        // For each trip, fetch batches with booking counts
        const tripsWithBatches = await Promise.all(result.rows.map(async (trip) => {
            const batchesQuery = `
                SELECT 
                    ba.id,
                    ba.from_date,
                    ba.to_date,
                    ba.batch_name,
                    COALESCE(SUM(b.travellers), 0) as booking_count
                FROM batches ba
                LEFT JOIN bookings b ON ba.id = b.batch_id
                WHERE ba.trip_id = $1
                GROUP BY ba.id, ba.from_date, ba.to_date, ba.batch_name
                ORDER BY ba.from_date ASC;
            `;
            const batchesResult = await pool.query(batchesQuery, [trip.id]);
            return {
                ...trip,
                batches: batchesResult.rows
            };
        }));
        
        res.json({ 
            success: true,
            count: tripsWithBatches.length,
            total: totalCount,
            page: page,
            limit: limit,
            totalPages: Math.ceil(totalCount / limit),
            trips: tripsWithBatches 
        });
    } catch (error) {
        console.error('Error fetching trips:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// GET /api/admin/trips/:id - Get a specific trip by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const tripId = req.params.id;

        const query = `
            SELECT 
                t.*,
                date_agg.earliest_from_date AS from_month,
                date_agg.latest_to_date AS to_month
            FROM trips t
            LEFT JOIN (
                SELECT 
                    trip_id,
                    MIN(from_date) AS earliest_from_date,
                    MAX(to_date) AS latest_to_date
                FROM batches
                GROUP BY trip_id
            ) date_agg ON date_agg.trip_id = t.id
            WHERE t.id = $1;
        `;

        const result = await pool.query(query, [tripId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Trip not found' 
            });
        }

        res.json({ 
            success: true,
            trip: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching trip details:', error);
        res.status(500).json({             success: false,
            error: error.message 
        });
    }
});

// POST /api/admin/trips - Create a new trip
router.post('/', authenticateToken, upload.fields([
    { name: 'images', maxCount: 8 },
    { name: 'itinerary', maxCount: 1 }
]), async (req, res) => {
    try {
        const { name, description, numberOfDays, daysData, days, nights, destinations, physicalRating } = req.body;
        
        // Validate required fields
        if (!name || !description || !numberOfDays || !daysData || !days || !nights || !destinations || !physicalRating ) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name, description, numberOfDays, daysData, days, nights, destinations, physicalRating'
            });
        }

        // Validate files
        if (!req.files || !req.files.images || req.files.images.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'At least one image is required'
            });
        }

        if (!req.files.itinerary || req.files.itinerary.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Itinerary file is required'
            });
        }

        // Parse daysData JSON BEFORE uploading files (it comes as string from FormData)
        let parsedDaysData;
        try {
            parsedDaysData = JSON.parse(daysData);
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Invalid daysData JSON format'
            });
        }

        // Check if trip with same destination_name already exists
        const existingTripQuery = 'SELECT id FROM trips WHERE destination_name = $1';
        const existingTrip = await pool.query(existingTripQuery, [name]);
        
        if (existingTrip.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Trip already exists with this destination name'
            });
        }

        // Sanitize destination name for file naming (trim spaces, lowercase, replace special chars)
        const sanitizedName = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        
        // Prepare file keys for S3 upload
        const itineraryFile = req.files.itinerary[0];
        const itineraryExtension = itineraryFile.originalname.split('.').pop();
        const itineraryKey = `itineraries/${sanitizedName}_itinerary.${itineraryExtension}`;
        const imageKeys = [];
        
        // Track uploaded files for potential rollback
        const uploadedKeys = [];
        
        try {
            // Upload itinerary file to S3
            const itineraryParams = {
                Bucket: bucketName,
                Key: itineraryKey,
                Body: itineraryFile.buffer,
                ContentType: itineraryFile.mimetype,
            };
            await s3.send(new PutObjectCommand(itineraryParams));
            uploadedKeys.push(itineraryKey);

            // Upload images to S3 with UUID naming
            for (let i = 0; i < req.files.images.length; i++) {
                const image = req.files.images[i];
                const imageExtension = image.originalname.split('.').pop();
                const imageUuid = randomImageName(16); // Generate UUID
                const imageKey = `trips/${sanitizedName}_${imageUuid}.${imageExtension}`;
                const imageParams = {
                    Bucket: bucketName,
                    Key: imageKey,
                    Body: image.buffer,
                    ContentType: image.mimetype,
                };
                await s3.send(new PutObjectCommand(imageParams));
                imageKeys.push(imageKey);
                uploadedKeys.push(imageKey);
            }

            // Handle days field - if it's JSON, store as-is; otherwise store the value
            let daysValue = days;
            if (typeof days === 'object') {
                daysValue = JSON.stringify(days);
            }

            // Insert trip into database
            const insertQuery = `
                INSERT INTO trips (
                    destination_name,
                    description,
                    itinerary,
                    destinations,
                    physical_rating,
                    days,
                    nights,
                    inclusions,
                    excluions,
                    status,
                    images
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *;
            `;

            const result = await pool.query(insertQuery, [
                name,
                description,
                daysData, // Store daysData as JSON stringified format
                destinations, // Store destinations from form
                parseInt(physicalRating), // Physical rating from form
                daysValue, // Days stored as-is (string or JSON string)
                parseInt(nights), // Nights from form
                '', // Default inclusions (can be added to form later)
                '', // Default exclusions (can be added to form later)
                true, // Active by default
                imageKeys.length // Number of images uploaded
            ]);

            res.status(201).json({
                success: true,
                message: 'Trip created successfully',
                trip: result.rows[0],
                imageKeys: imageKeys,
                itineraryKey: itineraryKey
            });
        } catch (dbError) {
            // Database insertion failed - rollback S3 uploads
            console.error('Database insertion failed, rolling back S3 uploads:', dbError);
            
            // Delete all uploaded files from S3
            for (const key of uploadedKeys) {
                try {
                    await s3.send(new DeleteObjectCommand({
                        Bucket: bucketName,
                        Key: key
                    }));
                    console.log(`Deleted ${key} from S3`);
                } catch (deleteError) {
                    console.error(`Failed to delete ${key} from S3:`, deleteError);
                }
            }
            
            throw dbError; // Re-throw to be caught by outer catch
        }
    } catch (error) {
        console.error('Error creating trip:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// PUT /api/admin/trips/:id - Update an existing trip
router.put('/:id', authenticateToken, upload.fields([
    { name: 'itinerary', maxCount: 1 },
    { name: 'images', maxCount: 30 }
]), async (req, res) => {
    try {
        const tripId = req.params.id;
        const { status, name, description, days, nights, destinations, physicalRating, daysData } = req.body;
        
        // Check if trip exists
        const existingTripQuery = 'SELECT id, destination_name FROM trips WHERE id = $1';
        const existingTrip = await pool.query(existingTripQuery, [tripId]);
        
        if (existingTrip.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Trip not found'
            });
        }

        const currentTripName = existingTrip.rows[0].destination_name;

        // If name is being updated, check if another trip (with different ID) has the same name
        if (name !== undefined && name !== currentTripName) {
            const duplicateNameQuery = 'SELECT id FROM trips WHERE destination_name = $1 AND id != $2';
            const duplicateTrip = await pool.query(duplicateNameQuery, [name, tripId]);
            
            if (duplicateTrip.rows.length > 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Another trip already exists with this destination name'
                });
            }
        }

        // Handle file uploads to S3
        const uploadedKeys = [];
        let itineraryKey = null;
        const imageKeys = [];

        // Use the trip name for S3 folder (updated or current)
        const tripNameForS3 = name || currentTripName;
        const sanitizedName = tripNameForS3.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        /**
         * Image Management Flow (UUID-based):
         * 1. Delete removed images from S3 (from removedImageKeys)
         * 2. Keep existing images as-is (they have unique UUID names)
         * 3. Upload new images with new UUID names
         */

        try {
            // Step 1: Delete removed images from S3 (if any)
            let removedImageKeys = [];
            if (req.body.removedImageKeys) {
                try {
                    removedImageKeys = JSON.parse(req.body.removedImageKeys);
                    console.log(`Deleting ${removedImageKeys.length} removed images from S3:`, removedImageKeys);
                    
                    for (const imageKey of removedImageKeys) {
                        try {
                            await s3.send(new DeleteObjectCommand({
                                Bucket: bucketName,
                                Key: imageKey
                            }));
                            console.log(`Deleted: ${imageKey}`);
                        } catch (deleteError) {
                            console.error(`Failed to delete ${imageKey}:`, deleteError.message);
                        }
                    }
                } catch (parseError) {
                    console.error('Error parsing removedImageKeys:', parseError);
                }
            }

            // Delete removed itinerary from S3 (if any)
            if (req.body.removedItineraryKey) {
                try {
                    console.log(`Deleting removed itinerary from S3: ${req.body.removedItineraryKey}`);
                    await s3.send(new DeleteObjectCommand({
                        Bucket: bucketName,
                        Key: req.body.removedItineraryKey
                    }));
                    console.log(`Deleted itinerary: ${req.body.removedItineraryKey}`);
                } catch (deleteError) {
                    console.error(`Failed to delete itinerary:`, deleteError.message);
                }
            }

            // Step 2: Track existing images (no renaming needed with UUID-based naming)
            let existingImageKeys = [];
            if (req.body.existingImageKeys) {
                try {
                    existingImageKeys = JSON.parse(req.body.existingImageKeys);
                    console.log(`Keeping ${existingImageKeys.length} existing images with UUID names`);
                    console.log('Existing image keys:', existingImageKeys);
                } catch (parseError) {
                    console.error('Error parsing existingImageKeys:', parseError);
                }
            }

            // Step 3: Upload itinerary file if provided
            if (req.files && req.files.itinerary && req.files.itinerary.length > 0) {
                const itineraryFile = req.files.itinerary[0];
                const itineraryExtension = itineraryFile.originalname.split('.').pop();
                itineraryKey = `trips/${sanitizedName}_itinerary.${itineraryExtension}`;
                
                const itineraryParams = {
                    Bucket: bucketName,
                    Key: itineraryKey,
                    Body: itineraryFile.buffer,
                    ContentType: itineraryFile.mimetype,
                };
                await s3.send(new PutObjectCommand(itineraryParams));
                uploadedKeys.push(itineraryKey);
            }

            // Upload new images if provided with UUID naming
            if (req.files && req.files.images && req.files.images.length > 0) {
                console.log(`Uploading ${req.files.images.length} new images with UUID naming`);
                console.log(`After upload, total will be: ${existingImageKeys.length} existing + ${req.files.images.length} new = ${existingImageKeys.length + req.files.images.length} total`);
                
                for (let i = 0; i < req.files.images.length; i++) {
                    const image = req.files.images[i];
                    const imageExtension = image.originalname.split('.').pop();
                    const imageUuid = randomImageName(16); // Generate UUID
                    const imageKey = `trips/${sanitizedName}_${imageUuid}.${imageExtension}`;
                    console.log(`Uploading new image ${i + 1}/${req.files.images.length} as: ${imageKey}`);
                    const imageParams = {
                        Bucket: bucketName,
                        Key: imageKey,
                        Body: image.buffer,
                        ContentType: image.mimetype,
                    };
                    await s3.send(new PutObjectCommand(imageParams));
                    imageKeys.push(imageKey);
                    uploadedKeys.push(imageKey);
                }
            }
        } catch (s3Error) {
            console.error('S3 upload error:', s3Error);
            return res.status(500).json({
                success: false,
                error: 'Failed to upload files to S3'
            });
        }

        // Build dynamic update query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (status !== undefined) {
            updates.push(`status = $${paramCount}`);
            values.push(status);
            paramCount++;
        }

        if (name !== undefined) {
            updates.push(`destination_name = $${paramCount}`);
            values.push(name);
            paramCount++;
        }

        if (description !== undefined) {
            updates.push(`description = $${paramCount}`);
            values.push(description);
            paramCount++;
        }

        if (days !== undefined) {
            updates.push(`days = $${paramCount}`);
            // Handle days field - if it's JSON, store as-is; otherwise store the value
            let daysValue = days;
            if (typeof days === 'object') {
                daysValue = JSON.stringify(days);
            }
            values.push(daysValue);
            paramCount++;
        }

        if (nights !== undefined) {
            updates.push(`nights = $${paramCount}`);
            values.push(parseInt(nights));
            paramCount++;
        }

        if (destinations !== undefined) {
            updates.push(`destinations = $${paramCount}`);
            values.push(destinations);
            paramCount++;
        }

        if (physicalRating !== undefined) {
            updates.push(`physical_rating = $${paramCount}`);
            values.push(parseInt(physicalRating));
            paramCount++;
        }

        if (daysData !== undefined) {
            updates.push(`itinerary = $${paramCount}`);
            // Store daysData as JSON stringified format
            values.push(daysData);
            paramCount++;
        } else if (itineraryKey) {
            // If no daysData but itinerary file was uploaded
            updates.push(`itinerary = $${paramCount}`);
            values.push(itineraryKey);
            paramCount++;
        }

        // Update images count if new images were uploaded OR if images were modified
        if (imageKeys.length > 0 || req.body.totalImageCount) {
            updates.push(`images = $${paramCount}`);
            // Use total count if provided (accounts for deletions and additions)
            const totalImageCount = req.body.totalImageCount ? parseInt(req.body.totalImageCount) : imageKeys.length;
            console.log(`Updating trip images count in DB: ${totalImageCount}`);
            values.push(totalImageCount);
            paramCount++;
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No fields to update'
            });
        }

        // Add trip ID as the last parameter
        values.push(tripId);

        const updateQuery = `
            UPDATE trips 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *;
        `;

        const result = await pool.query(updateQuery, values);

        res.json({
            success: true,
            message: 'Trip updated successfully',
            trip: result.rows[0],
            uploadedFiles: {
                itinerary: itineraryKey,
                images: imageKeys
            }
        });
    } catch (error) {
        console.error('Error updating trip:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// DELETE /api/admin/trips/:id - Delete a trip and its associated batches and bookings
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const tripId = req.params.id;

        // Start a transaction
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // First, delete all bookings associated with batches of this trip
            await client.query(
                'DELETE FROM bookings WHERE batch_id IN (SELECT id FROM batches WHERE trip_id = $1)',
                [tripId]
            );

            // Then, delete all batches associated with this trip
            await client.query('DELETE FROM batches WHERE trip_id = $1', [tripId]);

            // Finally, delete the trip itself
            const result = await client.query('DELETE FROM trips WHERE id = $1 RETURNING *', [tripId]);

            if (result.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({
                    success: false,
                    error: 'Trip not found'
                });
            }

            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: 'Trip and associated batches/bookings deleted successfully',
                deletedTrip: result.rows[0]
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error deleting trip:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
