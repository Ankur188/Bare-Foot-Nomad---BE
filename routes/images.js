import express from "express";
import pool from "../db.js";
import { authenticateToken } from "../middleware/authorization.js";
import multer from "multer";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import fs from "fs";
import path from "path";

dotenv.config();

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;
const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});


router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    // console.log(req)
    // const data = Buffer.from(req.body.image, "base64");
    // const categoryId = req.body.categoryId;
    // const filename = req.body.categoryId + "img";
    // const mimetype = req.body.mimetype;
    console.log(111, req.file);
    
    // Sanitize categoryId: trim spaces and convert to lowercase
    const sanitizedKey = req.body.categoryId ? req.body.categoryId.trim().toLowerCase() : "";
    
    const params = {
      Bucket: bucketName,
      Key: sanitizedKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };
    const command = new PutObjectCommand(params);
    await s3.send(command);
     res.send({ sucess: "File successfully uploaded" });
     } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).send("Error uploading image");
  }
});

router.get("/banner", async (req, res) => {
  try {
    const name = req.query.name;
    
    if (!name) {
      return res.status(400).json({ error: 'Banner name is required' });
    }
    
    // Sanitize name: trim spaces and convert to lowercase
    const sanitizedName = name.trim().toLowerCase();
    
    // Add 'banners/' prefix if not already present
    const s3Key = sanitizedName.startsWith('banners/') ? sanitizedName : `banners/${sanitizedName}`;
    
    const getObjectParams = {
      Bucket: bucketName,
      Key: s3Key,
    };
    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.json({ imageUrl : url });
      } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/img/trip - Get signed URLs for trip images by listing all images with tripname prefix
router.get("/trip", async (req, res) => {
  try {
    console.log('Trip images endpoint hit:', req.query);
    const tripName = req.query.name;
    
    if (!tripName) {
      console.log('Missing trip name in request');
      return res.status(400).json({ error: 'Trip name is required' });
    }
    
    // Sanitize trip name (same logic as in trips.js)
    const sanitizedName = tripName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    console.log('Sanitized trip name:', sanitizedName);
    
    // List all images with the trip name prefix
    const listParams = {
      Bucket: bucketName,
      Prefix: `trips/${sanitizedName}_`
    };
    
    const listCommand = new ListObjectsV2Command(listParams);
    const listResponse = await s3.send(listCommand);
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log('No images found for trip:', sanitizedName);
      return res.json({ images: [] });
    }
    
    // Generate signed URLs for all found images (excluding itinerary files)
    const imageUrls = [];
    
    for (const obj of listResponse.Contents) {
      // Skip files containing 'itinerary' in their name
      if (obj.Key.toLowerCase().includes('itinerary')) {
        console.log('Skipping itinerary file:', obj.Key);
        continue;
      }
      
      try {
        const getObjectParams = {
          Bucket: bucketName,
          Key: obj.Key,
        };
        const command = new GetObjectCommand(getObjectParams);
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
        
        imageUrls.push({
          key: obj.Key,
          url: url,
          name: obj.Key.split('/').pop(),
          size: obj.Size,
          lastModified: obj.LastModified
        });
      } catch (error) {
        console.error('Error generating signed URL for:', obj.Key, error);
      }
    }
    
    console.log('Returning response:', { imageCount: imageUrls.length });
    res.json({ 
      images: imageUrls
    });
  } catch (error) {
    console.error('Error in trip images endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/img/trip/itinerary - Get signed URL for trip itinerary file
router.get("/trip/itinerary", async (req, res) => {
  try {
    console.log('Trip itinerary endpoint hit:', req.query);
    const tripName = req.query.name;
    
    if (!tripName) {
      console.log('Missing trip name in request');
      return res.status(400).json({ error: 'Trip name is required' });
    }
    
    // Sanitize trip name (same logic as in trips.js)
    const sanitizedName = tripName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    console.log('Sanitized trip name:', sanitizedName);
    
    // List all files with the trip name prefix to find the itinerary
    const listParams = {
      Bucket: bucketName,
      Prefix: `trips/${sanitizedName}_`
    };
    
    const listCommand = new ListObjectsV2Command(listParams);
    const listResponse = await s3.send(listCommand);
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log('No files found for trip:', sanitizedName);
      return res.json({ success: false, itinerary: null });
    }
    
    // Find the itinerary file (contains 'itinerary' in the name)
    const itineraryFile = listResponse.Contents.find(obj => 
      obj.Key.toLowerCase().includes('itinerary')
    );
    
    if (!itineraryFile) {
      console.log('No itinerary file found for trip:', sanitizedName);
      return res.json({ success: false, itinerary: null });
    }
    
    try {
      const getObjectParams = {
        Bucket: bucketName,
        Key: itineraryFile.Key,
      };
      const command = new GetObjectCommand(getObjectParams);
      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
      
      console.log('Found itinerary file:', itineraryFile.Key);
      res.json({ 
        success: true,
        itinerary: {
          key: itineraryFile.Key,
          url: url,
          name: itineraryFile.Key.split('/').pop(),
          size: itineraryFile.Size,
          lastModified: itineraryFile.LastModified
        }
      });
    } catch (error) {
      console.error('Error generating signed URL for itinerary:', error);
      res.status(500).json({ error: error.message });
    }
  } catch (error) {
    console.error('Error in trip itinerary endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

