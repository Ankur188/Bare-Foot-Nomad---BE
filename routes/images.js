import express from "express";
import pool from "../db.js";
import { authenticateToken } from "../middleware/authorization.js";
import multer from "multer";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const router = express.Router();

// Save uploads to public/uploads so express.static serves them automatically
const uploadDir = path.join(process.cwd(), "public", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Use categoryId + original extension if provided
    const categoryId = req.body.categoryId || req.body.name || "file";
    const ext = path.extname(file.originalname) || "";
    cb(null, `${categoryId}${ext}`);
  },
});

const upload = multer({ storage: storage });

router.post("/upload", authenticateToken, upload.single("file"), async (req, res) => {
  try {
    // console.log(req)
    // const data = Buffer.from(req.body.image, "base64");
    // const categoryId = req.body.categoryId;
    // const filename = req.body.categoryId + "img";
    // const mimetype = req.body.mimetype;
    console.log(111, req.file);
    // File is already saved to disk by multer.diskStorage
    // Return the public URL for the uploaded image
    const fileName = req.file.filename;
    const publicUrl = `${req.protocol}://${req.get("host")}/uploads/${fileName}`;
    //refer this query
    // const result = await pool.query(
    //       'INSERT INTO trip_images (item_id, filename, mimetype, image) VALUES ((select id from trips where category = $1), $1, $2, $3) RETURNING id',
    //       [filename, mimetype, data]
    //     );

    // const result = await pool.query('INSERT INTO trip_images (item_id, filename, mimetype, image) VALUES ($1, $2, $3, $4) RETURNING id',
    //       [categoryId, filename, mimetype, data])

    // const imageId = result.rows[0].id;

    res.json({ success: true, url: publicUrl });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).send("Error uploading image");
  }
});

router.get("/banner", async (req, res) => {
  try {
    const name = req.query.name;
    // Look for a matching file in public/uploads. If found, return the public URL.
    const files = fs.readdirSync(uploadDir);
    const match = files.find((f) => f.toLowerCase().startsWith(String(name).toLowerCase()));
    if (!match) {
      return res.status(404).json({ error: "Image not found" });
    }
    const url = `${req.protocol}://${req.get("host")}/uploads/${match}`;
    res.json({ imageUrl: url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
