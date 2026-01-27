import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/authorization.js';

const router = express.Router();

// GET /api/admin/batches - Get all batches with associated users (bookings)
router.get('/batches', authenticateToken, async (req, res) => {
    try {
        // Fetch all batches with booking counts and user information
        const query = `
            SELECT 
                t.id,
                t.destination_name,
                t.from_date,
                t.to_date,
                t.days,
                t.nights,
                t.price,
                t.desitnations,
                t.physical_rating,
                t.description,
                t.itinerary,
                t.inclusions,
                t.excluions,
                t.single_room,
                t.double_room,
                t.triple_room,
                t.max_adventurers,
                t.status,
                t.batch_name,
                t.tax,
                COALESCE(
                    json_agg(b.name ORDER BY b.id) FILTER (WHERE b.id IS NOT NULL),
                    '[]'
                ) as users,
                COALESCE(
                    json_agg(b.travellers ORDER BY b.id) FILTER (WHERE b.id IS NOT NULL),
                    '[]'
                ) as travellers_array
            FROM batches t
            LEFT JOIN bookings b ON t.id = b.batch_id
            LEFT JOIN users u ON b.user_id = u.id
            GROUP BY t.id
            ORDER BY t.from_date DESC, t.destination_name;
        `;

        const result = await pool.query(query);
        
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
                t.id,
                t.destination_name,
                t.from_date,
                t.to_date,
                t.days,
                t.nights,
                t.price,
                t.desitnations,
                t.physical_rating,
                t.description,
                t.itinerary,
                t.inclusions,
                t.excluions,
                t.rooms,
                t.max_adventurers,
                t.status,
                t.batch_name,
                COALESCE(
                    json_agg(b.name ORDER BY b.id) FILTER (WHERE b.id IS NOT NULL),
                    '[]'
                ) as users,
                COALESCE(
                    json_agg(b.travellers ORDER BY b.id) FILTER (WHERE b.id IS NOT NULL),
                    '[]'
                ) as travellers_array
            FROM batches t
            LEFT JOIN bookings b ON t.id = b.batch_id
            LEFT JOIN users u ON b.user_id = u.id
            WHERE t.id = $1
            GROUP BY t.id;
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
