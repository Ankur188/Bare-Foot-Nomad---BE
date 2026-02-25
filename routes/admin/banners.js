import express from 'express';
import pool from '../../db.js';
import { authenticateToken } from '../../middleware/authorization.js';

const router = express.Router();

// GET /api/admin/banners - Get all banners
router.get('/', authenticateToken, async (req, res) => {
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
