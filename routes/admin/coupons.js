import express from 'express';
import pool from '../../db.js';
import { authenticateToken } from '../../middleware/authorization.js';

const router = express.Router();

// GET /api/admin/coupons - Get all coupons with pagination
router.get('/', authenticateToken, async (req, res) => {
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
