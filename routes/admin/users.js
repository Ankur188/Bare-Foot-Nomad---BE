import express from 'express';
import pool from '../../db.js';
import { authenticateToken } from '../../middleware/authorization.js';
import bcrypt from 'bcrypt';

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

// POST /api/admin/users - Create a new user
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, email, phoneNumber, role, password } = req.body;

        // Validate required fields
        if (!name || !email || !phoneNumber || !role) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name, email, phoneNumber, and role are required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid email format'
            });
        }

        // Validate phone number (should be numeric and 10 digits)
        if (!/^\d{10}$/.test(phoneNumber.toString())) {
            return res.status(400).json({
                success: false,
                error: 'Phone number must be exactly 10 digits'
            });
        }

        // Check if user with this email already exists
        const existingUserQuery = 'SELECT id FROM users WHERE email = $1';
        const existingUser = await pool.query(existingUserQuery, [email]);

        if (existingUser.rows.length > 0) {
            return res.status(409).json({
                success: false,
                error: 'User with this email already exists'
            });
        }

        // Generate default password if not provided (email without @ and domain)
        const defaultPassword = password || email.split('@')[0];
        
        // Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(defaultPassword, saltRounds);

        // Get current timestamp
        const createdAt = Math.floor(Date.now() / 1000);

        // Insert new user
        const insertQuery = `
            INSERT INTO users (name, email, password, phone_number, created_at, role)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, name, email, phone_number, created_at, role;
        `;

        const result = await pool.query(insertQuery, [
            name,
            email,
            hashedPassword,
            parseInt(phoneNumber),
            createdAt,
            role
        ]);

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// DELETE /api/admin/users/:id - Delete a user
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.id;

        // Check if user exists
        const existingUserQuery = 'SELECT id, name FROM users WHERE id = $1';
        const existingUser = await pool.query(existingUserQuery, [userId]);

        if (existingUser.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check if user has any bookings
        const bookingsQuery = 'SELECT COUNT(*) as count FROM bookings WHERE user_id = $1';
        const bookingsResult = await pool.query(bookingsQuery, [userId]);
        const bookingCount = parseInt(bookingsResult.rows[0].count);

        if (bookingCount > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete user with existing bookings'
            });
        }

        // Delete the user
        const deleteQuery = 'DELETE FROM users WHERE id = $1 RETURNING *';
        const result = await pool.query(deleteQuery, [userId]);

        res.json({
            success: true,
            message: 'User deleted successfully',
            deletedUser: result.rows[0]
        });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
