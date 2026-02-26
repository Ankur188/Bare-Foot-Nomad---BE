import express from 'express';
import pool from '../../db.js';
import { authenticateToken } from '../../middleware/authorization.js';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

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

// PUT /api/admin/banners/:id/image - Upload banner image to S3
router.put('/:id/image', authenticateToken, upload.single('image'), async (req, res) => {
    try {
        const bannerId = req.params.id;
        const imageFile = req.file;

        if (!imageFile) {
            return res.status(400).json({
                success: false,
                error: 'No image file provided'
            });
        }

        // Check if banner exists
        const bannerQuery = 'SELECT id, banner_name FROM banners WHERE id = $1';
        const bannerResult = await pool.query(bannerQuery, [bannerId]);

        if (bannerResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Banner not found'
            });
        }

        const banner = bannerResult.rows[0];
        
        // Sanitize banner name for use in S3 key (remove special characters)
        const sanitizedName = banner.banner_name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
        
        // Create S3 key using banner name without extension
        const imageKey = `banners/${sanitizedName}`;

        // Upload to S3
        const uploadParams = {
            Bucket: bucketName,
            Key: imageKey,
            Body: imageFile.buffer,
            ContentType: imageFile.mimetype,
        };

        await s3.send(new PutObjectCommand(uploadParams));

        // Update database with image URL (if you want to store it)
        // For now, we'll just return success since the schema doesn't have image_url field yet
        // You can add: UPDATE banners SET image_url = $1 WHERE id = $2
        
        res.json({
            success: true,
            message: 'Banner image uploaded successfully',
            imageKey: imageKey,
            imageUrl: `https://${bucketName}.s3.${bucketRegion}.amazonaws.com/${imageKey}`
        });
    } catch (error) {
        console.error('Error uploading banner image:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
