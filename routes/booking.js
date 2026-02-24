import express from 'express';
import pool from '../db.js';
import { authenticateToken } from '../middleware/authorization.js';

const router = express.Router();

// GET all bookings with optional userId filter
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.query;
        let query;
        let params = [];
        
        if (userId) {
            // Get bookings for a specific user
            query = `
                SELECT 
                    b.*,
                    batch.id as batch_id,
                    batch.trip_id,
                    batch.from_date,
                    batch.to_date,
                    batch.days,
                    batch.nights,
                    batch.price,
                    batch.max_adventurers,
                    batch.batch_name,
                    batch.single_room,
                    batch.double_room,
                    batch.triple_room,
                    batch.status as batch_status,
                    t.id as trip_id,
                    t.destination_name,
                    t.desitnations,
                    t.physical_rating,
                    t.description,
                    t.itinerary,
                    t.inclusions,
                    t.excluions,
                    t.status as trip_status
                FROM bookings b
                LEFT JOIN batches batch ON b.batch_id = batch.id
                LEFT JOIN trips t ON batch.trip_id = t.id
                WHERE b.user_id = $1
                ORDER BY b.id DESC
            `;
            params = [userId];
        } else {
            // Get all bookings
            query = `
                SELECT 
                    b.*,
                    batch.id as batch_id,
                    batch.trip_id,
                    batch.from_date,
                    batch.to_date,
                    batch.days,
                    batch.nights,
                    batch.price,
                    batch.max_adventurers,
                    batch.batch_name,
                    batch.single_room,
                    batch.double_room,
                    batch.triple_room,
                    batch.status as batch_status,
                    t.id as trip_id,
                    t.destination_name,
                    t.desitnations,
                    t.physical_rating,
                    t.description,
                    t.itinerary,
                    t.inclusions,
                    t.excluions,
                    t.status as trip_status
                FROM bookings b
                LEFT JOIN batches batch ON b.batch_id = batch.id
                LEFT JOIN trips t ON batch.trip_id = t.id
                ORDER BY b.id DESC
            `;
        }
        
        const result = await pool.query(query, params);
        
        // Transform the flat result into nested structure
        const bookings = result.rows.map(row => ({
            id: row.id,
            user_id: row.user_id,
            batch_id: row.batch_id,
            name: row.name,
            phone_number: row.phone_number,
            guardian_number: row.guardian_number,
            email: row.email,
            payment: row.payment,
            travellers: row.travellers,
            room_type: row.room_type,
            invoice_id: row.invoice_id,
            batch: row.batch_id ? {
                id: row.batch_id,
                trip_id: row.trip_id,
                from_date: row.from_date,
                to_date: row.to_date,
                days: row.days,
                nights: row.nights,
                price: row.price,
                max_adventurers: row.max_adventurers,
                batch_name: row.batch_name,
                single_room: row.single_room,
                double_room: row.double_room,
                triple_room: row.triple_room,
                status: row.batch_status,
                trip: row.trip_id ? {
                    id: row.trip_id,
                    destination_name: row.destination_name,
                    desitnations: row.desitnations,
                    physical_rating: row.physical_rating,
                    description: row.description,
                    itinerary: row.itinerary,
                    inclusions: row.inclusions,
                    excluions: row.excluions,
                    status: row.trip_status
                } : null
            } : null
        }));
        
        res.json({ bookings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

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