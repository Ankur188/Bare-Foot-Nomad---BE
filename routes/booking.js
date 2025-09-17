import express from 'express';
import pool from '../db.js';

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

router.post('/', async (req, res) => {
    try{
            const booking = await(pool.query('insert into bookings (user_id, trip_id, name, phone_number, guardian_number, email, payment, travellers, room_type, invoice_id) values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10) returning *', [req.body.userId, req.body.tripId, req.body.fullName, req.body.number, req.body.guardianNumber, req.body.email, req.body.payment, req.body.travellers, req.body.roomType, 0]));
            const booked = await(pool.query('select booked from trips where id = $1', [req.body.tripId]))
            await(pool.query('UPDATE trips SET booked = $1 WHERE id = $2', [req.body.tripId, booked+req.body.travellers]));
            res.json({booking : booking.rows});
        }
    catch(error){
        res.status(500).json({error: error.message});
    }
})

router.get('/:id', async (req, res) => {
    try{
         const bookingId = req.params.id;
        const bookingDetails = await pool.query("SELECT * FROM bookings where id = $1", [bookingId]);
        const tripDetails = await pool.query("select destination_name, from_date, to_date from trips where id=$1", [bookingDetails.rows[0].trip_id])
        let obj = bookingDetails.rows[0];
        obj = {...obj, ...tripDetails.rows[0]}
            res.json(obj);
        }
    catch(error){
        res.status(500).json({error: error.message});
    }
})

export default router;