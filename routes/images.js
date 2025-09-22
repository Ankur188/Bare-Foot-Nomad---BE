import express from "express";
import pool from "../db.js";
import { authenticateToken } from "../middleware/authorization.js";
import multer from "multer";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

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
    //refer this query
    // const result = await pool.query(
    //       'INSERT INTO trip_images (item_id, filename, mimetype, image) VALUES ((select id from trips where category = $1), $1, $2, $3) RETURNING id',
    //       [filename, mimetype, data]
    //     );

    // const result = await pool.query('INSERT INTO trip_images (item_id, filename, mimetype, image) VALUES ($1, $2, $3, $4) RETURNING id',
    //       [categoryId, filename, mimetype, data])

    // const imageId = result.rows[0].id;

    res.send({ sucess: "File successfully uploaded" });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).send("Error uploading image");
  }
});

router.get("/banner", async (req, res) => {
  try {
    const name = req.query.name;
    const getObjectParams = {
      Bucket: bucketName,
      Key: name,
    };
    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
    res.json({ imageUrl : url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
