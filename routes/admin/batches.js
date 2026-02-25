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

// POST /api/admin/batches - Create a new batch
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { 
            batchName, 
            assignedTrip, 
            startDate, 
            endDate, 
            standardPrice, 
            singleRoom, 
            doubleRoom, 
            tripleRoom, 
            tax, 
            maxAdventurers,
            createdAt,
            status 
        } = req.body;
        
        // Validate required fields
        if (!batchName || !assignedTrip || !startDate || !endDate || !standardPrice || 
            tripleRoom === undefined || tax === undefined || !maxAdventurers) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: batchName, assignedTrip, startDate, endDate, standardPrice, tripleRoom, tax, maxAdventurers'
            });
        }

        // Validate dates
        const fromDate = parseInt(startDate);
        const toDate = parseInt(endDate);
        if (toDate <= fromDate) {
            return res.status(400).json({
                success: false,
                error: 'End date must be after start date'
            });
        }

        // Check if batch with same name already exists
        const existingBatchQuery = 'SELECT id FROM batches WHERE batch_name = $1';
        const existingBatch = await pool.query(existingBatchQuery, [batchName]);
        
        if (existingBatch.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Batch already exists with this name'
            });
        }

        // Insert batch into database
        const insertQuery = `
            INSERT INTO batches (
                batch_name,
                trip_id,
                from_date,
                to_date,
                price,
                single_room,
                double_room,
                triple_room,
                tax,
                max_adventurers,
                created_at,
                status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING *;
        `;

        const result = await pool.query(insertQuery, [
            batchName,
            assignedTrip,
            fromDate,
            toDate,
            parseInt(standardPrice),
            parseInt(singleRoom) || 0,
            parseInt(doubleRoom) || 0,
            parseInt(tripleRoom),
            parseInt(tax),
            parseInt(maxAdventurers),
            createdAt || Math.floor(new Date().getTime() / 1000), // Use provided timestamp or current time (in seconds)
            status !== undefined ? status : true // Active by default
        ]);

        res.status(201).json({
            success: true,
            message: 'Batch created successfully',
            batch: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating batch:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// PUT /api/admin/batches/:id - Update an existing batch
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const batchId = req.params.id;
        const { 
            batchName, 
            assignedTrip, 
            startDate, 
            endDate, 
            standardPrice, 
            singleRoom, 
            doubleRoom, 
            tripleRoom, 
            tax, 
            maxAdventurers,
            status 
        } = req.body;
        
        // Check if batch exists
        const existingBatchQuery = 'SELECT id FROM batches WHERE id = $1';
        const existingBatch = await pool.query(existingBatchQuery, [batchId]);
        
        if (existingBatch.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Batch not found'
            });
        }

        // Validate dates if provided
        if (startDate && endDate) {
            const fromDate = parseInt(startDate);
            const toDate = parseInt(endDate);
            if (toDate <= fromDate) {
                return res.status(400).json({
                    success: false,
                    error: 'End date must be after start date'
                });
            }
        }

        // Build dynamic update query
        const updates = [];
        const values = [];
        let paramCount = 1;

        if (batchName !== undefined) {
            updates.push(`batch_name = $${paramCount}`);
            values.push(batchName);
            paramCount++;
        }
        if (assignedTrip !== undefined) {
            updates.push(`trip_id = $${paramCount}`);
            values.push(assignedTrip);
            paramCount++;
        }
        if (startDate !== undefined) {
            updates.push(`from_date = $${paramCount}`);
            values.push(parseInt(startDate));
            paramCount++;
        }
        if (endDate !== undefined) {
            updates.push(`to_date = $${paramCount}`);
            values.push(parseInt(endDate));
            paramCount++;
        }
        if (standardPrice !== undefined) {
            updates.push(`price = $${paramCount}`);
            values.push(parseInt(standardPrice));
            paramCount++;
        }
        if (singleRoom !== undefined) {
            updates.push(`single_room = $${paramCount}`);
            values.push(parseInt(singleRoom));
            paramCount++;
        }
        if (doubleRoom !== undefined) {
            updates.push(`double_room = $${paramCount}`);
            values.push(parseInt(doubleRoom));
            paramCount++;
        }
        if (tripleRoom !== undefined) {
            updates.push(`triple_room = $${paramCount}`);
            values.push(parseInt(tripleRoom));
            paramCount++;
        }
        if (tax !== undefined) {
            updates.push(`tax = $${paramCount}`);
            values.push(parseInt(tax));
            paramCount++;
        }
        if (maxAdventurers !== undefined) {
            updates.push(`max_adventurers = $${paramCount}`);
            values.push(parseInt(maxAdventurers));
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

        // Add batch ID as the last parameter
        values.push(batchId);

        const updateQuery = `
            UPDATE batches 
            SET ${updates.join(', ')}
            WHERE id = $${paramCount}
            RETURNING *;
        `;

        const result = await pool.query(updateQuery, values);

        res.json({
            success: true,
            message: 'Batch updated successfully',
            batch: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating batch:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// DELETE /api/admin/batches/:id - Delete a batch
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const batchId = req.params.id;

        // Check if batch exists
        const checkQuery = 'SELECT id FROM batches WHERE id = $1';
        const checkResult = await pool.query(checkQuery, [batchId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Batch not found'
            });
        }

        // Check if batch has associated bookings
        const bookingsQuery = 'SELECT id FROM bookings WHERE batch_id = $1 LIMIT 1';
        const bookingsResult = await pool.query(bookingsQuery, [batchId]);

        if (bookingsResult.rows.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Cannot delete batch with associated bookings/users'
            });
        }

        // Delete the batch
        const deleteQuery = 'DELETE FROM batches WHERE id = $1';
        await pool.query(deleteQuery, [batchId]);

        res.json({
            success: true,
            message: 'Batch deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting batch:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
