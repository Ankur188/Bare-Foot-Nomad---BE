import express from 'express';
import pool from '../../db.js';
import { authenticateToken } from '../../middleware/authorization.js';
import multer from 'multer';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import crypto from 'crypto';

const router = express.Router();

// Configure multer for file uploads (memory storage for S3)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Configure S3 client
const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const randomFileName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

// GET /api/admin/bookings - Get all bookings with pagination
router.get('/', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        // Get total count of bookings
        const countQuery = `SELECT COUNT(*) as total FROM bookings`;
        const countResult = await pool.query(countQuery);
        const totalCount = parseInt(countResult.rows[0].total);

        // Fetch paginated bookings with user, batch, and trip information
        const query = `
            SELECT 
                b.id,
                b.user_id,
                b.batch_id,
                b.name,
                b.phone_number,
                b.guardian_number,
                b.email,
                b.payment,
                b.travellers,
                b.room_type,
                b.invoice_id,
                u.name as user_name,
                u.email as user_email,
                ba.batch_name,
                ba.from_date,
                ba.to_date,
                t.destination_name
            FROM bookings b
            LEFT JOIN users u ON b.user_id = u.id
            LEFT JOIN batches ba ON b.batch_id = ba.id
            LEFT JOIN trips t ON ba.trip_id = t.id
            ORDER BY b.id DESC
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
            bookings: result.rows 
        });
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// GET /api/admin/bookings/:id - Get a specific booking by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch booking with user and batch information
        const query = `
            SELECT 
                b.id,
                b.user_id,
                b.batch_id,
                b.name,
                b.phone_number,
                b.guardian_number,
                b.email,
                b.payment,
                b.travellers,
                b.room_type,
                b.invoice_id,
                u.name as user_name,
                u.email as user_email,
                ba.batch_name,
                ba.from_date,
                ba.to_date
            FROM bookings b
            LEFT JOIN users u ON b.user_id = u.id
            LEFT JOIN batches ba ON b.batch_id = ba.id
            WHERE b.id = $1;
        `;

        const result = await pool.query(query, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Booking not found' 
            });
        }

        res.json({ 
            success: true,
            booking: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching booking:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// POST /api/admin/bookings - Create a new booking
router.post('/', authenticateToken, upload.single('invoice'), async (req, res) => {
    try {
        const { 
            user, 
            batch, 
            name, 
            phoneNumber, 
            guardianNumber, 
            email, 
            payment, 
            travellers, 
            roomType 
        } = req.body;

        // Parse user and batch if they're JSON strings
        let userId, batchId;
        try {
            if (typeof user === 'string') {
                // Try to parse as JSON only if it looks like JSON (starts with { or [)
                if (user.trim().startsWith('{') || user.trim().startsWith('[')) {
                    const userObj = JSON.parse(user);
                    userId = userObj.id;
                } else {
                    // Treat as UUID string directly
                    userId = user;
                }
            } else if (user && user.id) {
                userId = user.id;
            } else {
                userId = user;
            }

            if (typeof batch === 'string') {
                // Try to parse as JSON only if it looks like JSON (starts with { or [)
                if (batch.trim().startsWith('{') || batch.trim().startsWith('[')) {
                    const batchObj = JSON.parse(batch);
                    batchId = batchObj.id;
                } else {
                    // Treat as UUID string directly
                    batchId = batch;
                }
            } else if (batch && batch.id) {
                batchId = batch.id;
            } else {
                batchId = batch;
            }
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user or batch format'
            });
        }

        // Validate invoice file is provided
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Invoice file is required'
            });
        }

        // Validate required fields
        if (!userId || !batchId || !name || !phoneNumber || !email || !payment || !travellers || !roomType) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: user, batch, name, phoneNumber, email, payment, travellers, and roomType are required'
            });
        }

        // Validate payment is a positive number
        const paymentNum = parseFloat(payment);
        if (isNaN(paymentNum) || paymentNum <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Payment must be a positive number greater than 0'
            });
        }

        // Validate travellers is a positive number
        const travellersNum = parseInt(travellers);
        if (isNaN(travellersNum) || travellersNum <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Travellers must be a positive number greater than 0'
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

        // Validate guardian number if provided
        if (guardianNumber && !/^\d{10}$/.test(guardianNumber.toString())) {
            return res.status(400).json({
                success: false,
                error: 'Guardian number must be exactly 10 digits'
            });
        }

        // Check if user exists
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check if batch exists
        const batchCheck = await pool.query('SELECT id, max_adventurers FROM batches WHERE id = $1', [batchId]);
        if (batchCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Batch not found'
            });
        }

        // Check if batch has capacity for the travellers
        const batchCapacityQuery = `
            SELECT 
                b.max_adventurers,
                COALESCE(SUM(bk.travellers), 0) as current_bookings
            FROM batches b
            LEFT JOIN bookings bk ON b.id = bk.batch_id
            WHERE b.id = $1
            GROUP BY b.max_adventurers
        `;
        const capacityResult = await pool.query(batchCapacityQuery, [batchId]);
        const { max_adventurers, current_bookings } = capacityResult.rows[0];
        
        if (parseInt(current_bookings) + travellersNum > max_adventurers) {
            return res.status(400).json({
                success: false,
                error: `Cannot book ${travellersNum} travellers. Batch has capacity for ${max_adventurers - current_bookings} more adventurers.`
            });
        }

        // Insert booking into database first to get the booking ID
        const insertQuery = `
            INSERT INTO bookings (
                user_id, 
                batch_id, 
                name, 
                phone_number, 
                guardian_number, 
                email, 
                payment, 
                travellers, 
                room_type, 
                invoice_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *;
        `;

        const result = await pool.query(insertQuery, [
            userId,
            batchId,
            name,
            phoneNumber,
            guardianNumber || null,
            email,
            paymentNum,
            travellersNum,
            roomType,
            0 // invoice_id set to 0 initially
        ]);

        const bookingId = result.rows[0].id;

        // Upload invoice to S3 with booking ID as filename
        try {
            const invoiceExtension = req.file.originalname.split('.').pop();
            const invoiceKey = `${bookingId}.${invoiceExtension}`;
            
            const invoiceParams = {
                Bucket: bucketName,
                Key: invoiceKey,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
            };
            
            await s3.send(new PutObjectCommand(invoiceParams));
            
            console.log(`Invoice uploaded to S3: ${invoiceKey} for booking ID: ${bookingId}`);
        } catch (uploadError) {
            console.error('Error uploading invoice:', uploadError);
            // Note: Booking is already created, but invoice upload failed
            // You may want to implement cleanup or marking the booking as incomplete
            return res.status(500).json({
                success: false,
                error: 'Booking created but failed to upload invoice file',
                bookingId: bookingId
            });
        }

        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            booking: result.rows[0]
        });

    } catch (error) {
        console.error('Error creating booking:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// PUT /api/admin/bookings/:id - Update an existing booking
router.put('/:id', authenticateToken, upload.single('invoice'), async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            user, 
            batch, 
            name, 
            phoneNumber, 
            guardianNumber, 
            email, 
            payment, 
            travellers, 
            roomType 
        } = req.body;

        // Check if booking exists
        const checkQuery = 'SELECT id FROM bookings WHERE id = $1';
        const checkResult = await pool.query(checkQuery, [id]);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Booking not found' 
            });
        }

        // Parse user and batch if they're JSON strings
        let userId, batchId;
        try {
            if (typeof user === 'string') {
                // Try to parse as JSON only if it looks like JSON (starts with { or [)
                if (user.trim().startsWith('{') || user.trim().startsWith('[')) {
                    const userObj = JSON.parse(user);
                    userId = userObj.id;
                } else {
                    // Treat as UUID string directly
                    userId = user;
                }
            } else if (user && user.id) {
                userId = user.id;
            } else {
                userId = user;
            }

            if (typeof batch === 'string') {
                // Try to parse as JSON only if it looks like JSON (starts with { or [)
                if (batch.trim().startsWith('{') || batch.trim().startsWith('[')) {
                    const batchObj = JSON.parse(batch);
                    batchId = batchObj.id;
                } else {
                    // Treat as UUID string directly
                    batchId = batch;
                }
            } else if (batch && batch.id) {
                batchId = batch.id;
            } else {
                batchId = batch;
            }
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user or batch format'
            });
        }

        // Validate required fields
        if (!userId || !batchId || !name || !phoneNumber || !email || !payment || !travellers || !roomType) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: user, batch, name, phoneNumber, email, payment, travellers, and roomType are required'
            });
        }

        // Validate payment is a positive number
        const paymentNum = parseFloat(payment);
        if (isNaN(paymentNum) || paymentNum <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Payment must be a positive number greater than 0'
            });
        }

        // Validate travellers is a positive number
        const travellersNum = parseInt(travellers);
        if (isNaN(travellersNum) || travellersNum <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Travellers must be a positive number greater than 0'
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

        // Validate guardian number if provided
        if (guardianNumber && !/^\d{10}$/.test(guardianNumber.toString())) {
            return res.status(400).json({
                success: false,
                error: 'Guardian number must be exactly 10 digits'
            });
        }

        // Check if user exists
        const userCheck = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
        if (userCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check if batch exists
        const batchCheck = await pool.query('SELECT id FROM batches WHERE id = $1', [batchId]);
        if (batchCheck.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Batch not found'
            });
        }

        // Update booking in database
        const updateQuery = `
            UPDATE bookings 
            SET user_id = $1,
                batch_id = $2,
                name = $3,
                phone_number = $4,
                guardian_number = $5,
                email = $6,
                payment = $7,
                travellers = $8,
                room_type = $9
            WHERE id = $10
            RETURNING *;
        `;

        const result = await pool.query(updateQuery, [
            userId,
            batchId,
            name,
            phoneNumber,
            guardianNumber || null,
            email,
            paymentNum,
            travellersNum,
            roomType,
            id
        ]);

        // If a new invoice file is provided, upload it to S3 with booking ID as filename
        if (req.file) {
            try {
                const invoiceExtension = req.file.originalname.split('.').pop();
                const invoiceKey = `${id}.${invoiceExtension}`;
                
                const invoiceParams = {
                    Bucket: bucketName,
                    Key: invoiceKey,
                    Body: req.file.buffer,
                    ContentType: req.file.mimetype,
                };
                
                await s3.send(new PutObjectCommand(invoiceParams));
                
                console.log(`Invoice uploaded to S3: ${invoiceKey} for booking ID: ${id}`);
            } catch (uploadError) {
                console.error('Error uploading invoice:', uploadError);
                // Note: Booking is already updated, but invoice upload failed
                return res.status(500).json({
                    success: false,
                    error: 'Booking updated but failed to upload invoice file',
                    booking: result.rows[0]
                });
            }
        }

        res.status(200).json({
            success: true,
            message: 'Booking updated successfully',
            booking: result.rows[0]
        });

    } catch (error) {
        console.error('Error updating booking:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// DELETE /api/admin/bookings/:id - Delete a booking
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // Check if booking exists
        const checkQuery = 'SELECT id, name FROM bookings WHERE id = $1';
        const checkResult = await pool.query(checkQuery, [id]);
        
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ 
                success: false,
                error: 'Booking not found' 
            });
        }

        // Delete invoice from S3 if it exists
        try {
            // List all files with the booking ID prefix to find the invoice
            const listParams = {
                Bucket: bucketName,
                Prefix: `${id}.`
            };
            
            const listCommand = new ListObjectsV2Command(listParams);
            const listResult = await s3.send(listCommand);
            
            // Delete all matching invoice files
            if (listResult.Contents && listResult.Contents.length > 0) {
                for (const file of listResult.Contents) {
                    const deleteParams = {
                        Bucket: bucketName,
                        Key: file.Key
                    };
                    await s3.send(new DeleteObjectCommand(deleteParams));
                    console.log(`Deleted invoice from S3: ${file.Key}`);
                }
            } else {
                console.log(`No invoice found in S3 for booking ID: ${id}`);
            }
        } catch (s3Error) {
            // Log the error but continue with booking deletion
            console.error('Error deleting invoice from S3:', s3Error);
            // Don't return error - proceed with booking deletion
        }

        // Delete the booking from database
        const deleteQuery = 'DELETE FROM bookings WHERE id = $1 RETURNING id';
        const result = await pool.query(deleteQuery, [id]);

        res.json({ 
            success: true,
            message: 'Booking deleted successfully',
            bookingId: result.rows[0].id
        });
    } catch (error) {
        console.error('Error deleting booking:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

export default router;
