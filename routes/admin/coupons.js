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

// GET /api/admin/coupons/:id - Get a specific coupon by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const couponId = req.params.id;

        const query = `
            SELECT 
                id,
                code,
                deduction,
                start_date,
                end_date,
                status
            FROM coupons
            WHERE id = $1;
        `;

        const result = await pool.query(query, [couponId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Coupon not found' 
            });
        }

        res.json({ 
            success: true,
            coupon: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching coupon details:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// PUT /api/admin/coupons/:id - Update an existing coupon
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const couponId = req.params.id;
        const { deduction, startDate, endDate, status } = req.body;
        
        // Check if coupon exists
        const existingCouponQuery = 'SELECT id FROM coupons WHERE id = $1';
        const existingCoupon = await pool.query(existingCouponQuery, [couponId]);
        
        if (existingCoupon.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Coupon not found'
            });
        }

        // Build dynamic update query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (deduction !== undefined) {
            updates.push(`deduction = $${paramCount}`);
            values.push(parseFloat(deduction));
            paramCount++;
        }

        if (startDate !== undefined) {
            updates.push(`start_date = $${paramCount}`);
            values.push(parseInt(startDate));
            paramCount++;
        }

        if (endDate !== undefined) {
            updates.push(`end_date = $${paramCount}`);
            values.push(parseInt(endDate));
            paramCount++;
        }

        if (status !== undefined) {
            updates.push(`status = $${paramCount}`);
            values.push(status);
            paramCount++;
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No fields to update'
            });
        }

        // Add coupon ID as the last parameter
        values.push(couponId);

        const updateQuery = `
            UPDATE coupons 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *;
        `;

        const result = await pool.query(updateQuery, values);

        res.json({
            success: true,
            message: 'Coupon updated successfully',
            coupon: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating coupon:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
