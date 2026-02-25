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
        
        res.json({ 
            success: true,
            count: result.rows.length,
            total: totalCount,
            page: page,
            limit: limit,
            totalPages: Math.ceil(totalCount / limit),
            trips: result.rows 
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

        // Sanitize destination name for file naming
        const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
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

            // Upload images to S3
            for (let i = 0; i < req.files.images.length; i++) {
                const image = req.files.images[i];
                const imageExtension = image.originalname.split('.').pop();
                const imageKey = `trips/${sanitizedName}_${i + 1}.${imageExtension}`;
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

            // Prepare itinerary text from daysData
            let itineraryText = '';
            for (let i = 1; i <= parseInt(numberOfDays); i++) {
                const day = parsedDaysData[i.toString()];
                if (day) {
                    itineraryText += `Day ${i}: ${day.title}\n${day.content}\n\n`;
                }
            }

            // Insert trip into database
            const insertQuery = `
                INSERT INTO trips (
                    destination_name,
                    description,
                    itinerary,
                    desitnations,
                    physical_rating,
                    days,
                    nights,
                    inclusions,
                    excluions,
                    status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *;
            `;

            const result = await pool.query(insertQuery, [
                name,
                description,
                itineraryText || itineraryKey, // Store either formatted text or file key
                destinations, // Store destinations from form
                parseInt(physicalRating), // Physical rating from form
                parseInt(days), // Days from form
                parseInt(nights), // Nights from form
                '', // Default inclusions (can be added to form later)
                '', // Default exclusions (can be added to form later)
                true // Active by default
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
