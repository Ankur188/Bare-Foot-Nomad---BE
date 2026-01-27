import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/authorization.js';

const router = express.Router();

// router.get('/', authenticateToken, async (req, res) => {
//     try{
//         const users = await pool.query('select * from users');
//         res.json({users : users.rows});
//     }
//     catch(error){
//         res.status(500).json({error: error.message});
//     }
// })

router.post('/', authenticateToken, async (req, res) => {
    try{
            const booking = await(pool.query('insert into bookings (user_id, batch_id, name, phone_number, guardian_number, email, payment, travellers, room_type, invoice_id) values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10) returning *', [req.body.userId, req.body.batch_id, req.body.fullName, req.body.number, req.body.guardianNumber, req.body.email, req.body.payment, req.body.travellers, req.body.roomType, 0]));
            // const booked = await(pool.query('select booked from batches where id = $1', [req.body.tripId]))
            // await(pool.query('UPDATE batches SET booked = $1 WHERE id = $2', [req.body.tripId, booked+req.body.travellers]));

            //this comment code needs to be there 
            res.json({booking : booking.rows});
        }
    catch(error){
        res.status(500).json({error: error.message});
    }
})

router.get('/:id', authenticateToken, async (req, res) => {
    try{
        const bookingId = req.params.id;
        
        // Get booking details
        const bookingDetails = await pool.query("SELECT * FROM bookings WHERE id = $1", [bookingId]);
        
        if (bookingDetails.rows.length === 0) {
            return res.status(404).json({ error: 'Booking not found' });
        }
        
        const booking = bookingDetails.rows[0];
        
        // Get batch details related to this booking
        const batchDetails = await pool.query("SELECT * FROM batches WHERE id = $1", [booking.batch_id]);
        
        // Get trip details related to the batch
        let tripDetails = null;
        if (batchDetails.rows.length > 0 && batchDetails.rows[0].trip_id) {
            const tripResult = await pool.query("SELECT * FROM trips WHERE id = $1", [batchDetails.rows[0].trip_id]);
            tripDetails = tripResult.rows.length > 0 ? tripResult.rows[0] : null;
        }
        
        // Build response with nested objects
        const response = {
            ...booking,
            batch: batchDetails.rows.length > 0 ? {
                ...batchDetails.rows[0],
                trip: tripDetails
            } : null
        };
        
        res.json(response);
    }
    catch(error){
        res.status(500).json({error: error.message});
    }
})

export default router;