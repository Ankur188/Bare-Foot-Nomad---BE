import express from "express";
import pool from "../db.js";
import { authenticateToken } from "../middleware/authorization.js";
import multer from "multer";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
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
    const params = {
      Bucket: bucketName,
      Key: req.body.categoryId + "",
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
    
    // Add 'banners/' prefix if not already present
    const s3Key = name.startsWith('banners/') ? name : `banners/${name}`;
    
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

export default router;

