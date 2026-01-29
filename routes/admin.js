import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/authorization.js';

const router = express.Router();

// GET /api/admin/trips - Get all trips with pagination
router.get('/trips', authenticateToken, async (req, res) => {
    try {
        // Get pagination parameters from query string
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // Get total count of trips
        const countQuery = `SELECT COUNT(*) as total FROM trips`;
        const countResult = await pool.query(countQuery);
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
            ORDER BY t.destination_name
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

export default router;
