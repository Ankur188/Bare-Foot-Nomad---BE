import express from 'express';
import pool from '../../db.js';
import { authenticateToken } from '../../middleware/authorization.js';

const router = express.Router();

// GET /api/admin/batches - Get all batches with pagination
router.get('/', authenticateToken, async (req, res) => {
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
router.get('/:id', authenticateToken, async (req, res) => {
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

export default router;
