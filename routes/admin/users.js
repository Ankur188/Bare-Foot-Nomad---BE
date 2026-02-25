import express from 'express';
import pool from '../../db.js';
import { authenticateToken } from '../../middleware/authorization.js';

const router = express.Router();

// GET /api/admin/users - Get all users with their associated trips with pagination
router.get('/', authenticateToken, async (req, res) => {
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

export default router;
