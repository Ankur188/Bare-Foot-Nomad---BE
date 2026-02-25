import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/authorization.js';
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
router.get('/trips', authenticateToken, async (req, res) => {
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

// POST /api/admin/trips - Create a new trip
router.post('/trips', authenticateToken, upload.fields([
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

// GET /api/admin/batches - Get all batches with associated users (bookings)
router.get('/batches', authenticateToken, async (req, res) => {
    try {
        // Get pagination parameters from query string
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // Get total count of batches
        const countQuery = `SELECT COUNT(DISTINCT ba.id) as total FROM batches ba`;
        const countResult = await pool.query(countQuery);
        const totalCount = parseInt(countResult.rows[0].total);

        // Fetch paginated batches with booking counts and user information
        const query = `
            SELECT 
                ba.id,
                tr.destination_name,
                ba.from_date,
                ba.to_date,
                ba.days,
                ba.nights,
                ba.price,
                ba.tax,
                ba.single_room,
                ba.double_room,
                ba.triple_room,
                ba.max_adventurers,
                ba.status,
                ba.batch_name,
                ba.trip_id,
                COALESCE(
                    json_agg(b.name ORDER BY b.id) FILTER (WHERE b.id IS NOT NULL),
                    '[]'
                ) as users,
                COALESCE(
                    json_agg(b.travellers ORDER BY b.id) FILTER (WHERE b.id IS NOT NULL),
                    '[]'
                ) as travellers_array
            FROM batches ba
            LEFT JOIN trips tr ON ba.trip_id = tr.id
            LEFT JOIN bookings b ON ba.id = b.batch_id
            LEFT JOIN users u ON b.user_id = u.id
            GROUP BY ba.id, tr.destination_name
            ORDER BY ba.from_date DESC, tr.destination_name
            LIMIT $1 OFFSET $2;
        `;

        const result = await pool.query(query, [limit, offset]);
        
        // Transform the data to have cleaner structure
        const batches = result.rows.map(trip => {
            return {
                ...trip,
                total_bookings: trip.users.length,
                total_travellers: trip.travellers_array.reduce((sum, count) => sum + (count || 0), 0),
                users_count: trip.users.length,
                users: trip.users,  // Array of names only
                travellers_array: undefined  // Remove internal helper array
            };
        });

        res.json({ 
            success: true,
            count: batches.length,
            total: totalCount,
            page: page,
            limit: limit,
            totalPages: Math.ceil(totalCount / limit),
            batches: batches 
        });
    } catch (error) {
        console.error('Error fetching batches with users:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// GET /api/admin/batches/:id - Get specific batch with associated users
router.get('/batches/:id', authenticateToken, async (req, res) => {
    try {
        const tripId = req.params.id;
        
        const query = `
            SELECT 
                ba.id,
                tr.destination_name,
                ba.from_date,
                ba.to_date,
                ba.days,
                ba.nights,
                ba.price,
                ba.tax,
                ba.single_room,
                ba.double_room,
                ba.triple_room,
                ba.max_adventurers,
                ba.status,
                ba.batch_name,
                ba.trip_id,
                COALESCE(
                    json_agg(b.name ORDER BY b.id) FILTER (WHERE b.id IS NOT NULL),
                    '[]'
                ) as users,
                COALESCE(
                    json_agg(b.travellers ORDER BY b.id) FILTER (WHERE b.id IS NOT NULL),
                    '[]'
                ) as travellers_array
            FROM batches ba
            LEFT JOIN trips tr ON ba.trip_id = tr.id
            LEFT JOIN bookings b ON ba.id = b.batch_id
            LEFT JOIN users u ON b.user_id = u.id
            WHERE ba.id = $1
            GROUP BY ba.id, tr.destination_name;
        `;

        const result = await pool.query(query, [tripId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Batch not found' 
            });
        }

        const batch = {
            ...result.rows[0],
            total_bookings: result.rows[0].users.length,
            total_travellers: result.rows[0].travellers_array.reduce((sum, count) => sum + (count || 0), 0),
            users_count: result.rows[0].users.length,
            users: result.rows[0].users,
            travellers_array: undefined
        };

        res.json({ 
            success: true,
            batch: batch 
        });
    } catch (error) {
        console.error('Error fetching batch details:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// GET /api/admin/users - Get all users with their associated trips with pagination
router.get('/users', authenticateToken, async (req, res) => {
    try {
        // Get pagination parameters from query string
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // Get total count of users
        const countQuery = `SELECT COUNT(*) as total FROM users`;
        const countResult = await pool.query(countQuery);
        const totalCount = parseInt(countResult.rows[0].total);

        // Fetch paginated users with their associated trips (only destination_name)
        const query = `
            SELECT 
                u.id,
                u.name,
                u.email,
                u.phone_number,
                u.created_at,
                u.role,
                COALESCE(
                    json_agg(
                        DISTINCT tr.destination_name
                    ) FILTER (WHERE tr.destination_name IS NOT NULL),
                    '[]'
                ) as trips
            FROM users u
            LEFT JOIN bookings b ON u.id = b.user_id
            LEFT JOIN batches bat ON b.batch_id = bat.id
            LEFT JOIN trips tr ON bat.trip_id = tr.id
            GROUP BY u.id
            ORDER BY u.created_at DESC
            LIMIT $1 OFFSET $2;
        `;

        const result = await pool.query(query, [limit, offset]);
        
        res.json({ 
            success: true,
            count: result.rows.length,
            total: totalCount,
            page: page,
            limit: limit,
            totalPages: Math.ceil(totalCount / limit),
            users: result.rows 
        });
    } catch (error) {
        console.error('Error fetching users with trips:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// GET /api/admin/coupons - Get all coupons with pagination
router.get('/coupons', authenticateToken, async (req, res) => {
    try {
        // Get pagination parameters from query string
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // Get total count of coupons
        const countQuery = `SELECT COUNT(*) as total FROM coupons`;
        const countResult = await pool.query(countQuery);
        const totalCount = parseInt(countResult.rows[0].total);

        const query = `
            SELECT 
                id,
                code,
                deduction,
                start_date,
                end_date,
                status
            FROM coupons
            ORDER BY start_date DESC
            LIMIT $1 OFFSET $2;
        `;

        const result = await pool.query(query, [limit, offset]);
        
        res.json({ 
            success: true,
            count: result.rows.length,
            total: totalCount,
            page: page,
            limit: limit,
            totalPages: Math.ceil(totalCount / limit),
            coupons: result.rows 
        });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// GET /api/admin/banners - Get all banners
router.get('/banners', authenticateToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                id,
                banner_name,
                description,
                status,
                created_at
            FROM banners
            ORDER BY created_at DESC;
        `;

        const result = await pool.query(query);
        
        res.json({ 
            success: true,
            count: result.rows.length,
            banners: result.rows 
        });
    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

export default router;
