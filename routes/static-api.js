import express from "express";
import pool from "../db.js";
import dotenv from "dotenv";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

dotenv.config();

const router = express.Router();
const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;

// S3 client: automatically fetches credentials from environment / IAM role
const s3 = new S3Client({
  region: bucketRegion,
});

// Helper function to generate presigned URL
async function getTripSignedUrl(bucketName, key) {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key, // exact S3 key
  });
  return await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour
}

// Route to get trips with presigned image URLs
router.get("/", async (req, res) => {
  try {
    // Fetch trips (distinct destination with min price)
    const tripsResult = await pool.query(
      `SELECT DISTINCT ON (destination_name) * 
       FROM trips t 
       WHERE t.price = (
         SELECT MIN(price) FROM trips WHERE destination_name = t.destination_name
       )
       ORDER BY t.destination_name;`
    );
    console.log('trips', tripsResult)
    // Fetch min/max dates for each destination
    const datesResult = await pool.query(
      `SELECT destination_name, 
              MIN(from_date) AS from_date, 
              MAX(to_date) AS to_date 
       FROM trips 
       GROUP BY destination_name 
       ORDER BY destination_name;`
    );

    // Attach presigned image URL to each trip
    for (const trip of tripsResult.rows) {
      try {
        trip.imageUrl = await getTripSignedUrl(
          bucketName,
          trip.destination_name
        );
      } catch (err) {
        console.error(
          "Failed to generate signed URL for",
          trip.destination_name,
          err
        );
        trip.imageUrl = null;
      }
    }

    // Attach from_month / to_month for each trip
    tripsResult.rows = tripsResult.rows.map((trip) => {
      const dateEntry = datesResult.rows.find(
        (item) => item.destination_name === trip.destination_name
      );
      if (dateEntry) {
        trip.from_month = dateEntry.from_date;
        trip.to_month = dateEntry.to_date;
      }
      return trip;
    });

    res.json({ trips: tripsResult.rows });
  } catch (err) {
    console.error("Error fetching trips:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/enquire", async (req, res) => {
  try {
    // console.log('req', req.body)
    await pool.query(
      "insert into leads (type, name , location, travellers, days, email, phone, message, budget) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
      [
        req.body.type,
        req.body.name,
        req.body.location,
        req.body.travellers,
        req.body.days,
        req.body.email,
        req.body.phone,
        req.body.message,
        req.body.budget,
      ]
    );
    res.json({ message: "Successful" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const tripId = req.params.id;
    const tripDetails = await pool.query("SELECT * FROM trips where id = $1", [
      tripId,
    ]);
    const dates = await pool.query(
      "SELECT MIN(from_date) AS from_month, MAX(to_date) AS to_month FROM trips WHERE destination_name = (SELECT destination_name FROM trips WHERE id = $1)",
      [tripId]
    );
    tripDetails.rows[0]["from_month"] = dates.rows[0].from_month;
    tripDetails.rows[0]["to_month"] = dates.rows[0].to_month;

    res.json(tripDetails.rows[0]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:destination/batches", async (req, res) => {
  try {
    //     const page = parseInt(req.query.page) || 1;
    // const limit = 4;
    // const offset = (page - 1) * limit;

    const destination = req.params.destination;
    // const trips = await pool.query("SELECT * FROM trips where destination_name = $1  ORDER BY price ASC LIMIT $2 OFFSET $3", [destination, limit, offset]);
    //     const countResult = await pool.query("SELECT COUNT(*) FROM trips where destination_name = $1", [destination]);
    // const totalRows = parseInt(countResult.rows[0].count);
    // console.log(totalRows)
    // const totalPages = Math.ceil(totalRows / limit);

    // res.json({
    //         page: page,
    //   totalPages: totalPages,
    //   data: trips.rows
    // })

    const { month, page = 1 } = req.query;
    const limit = 4;

    const offset = (page - 1) * limit;

    if (month) {
      const query = `
  SELECT *, COUNT(*) OVER() AS total_count
  FROM trips
  WHERE EXTRACT(MONTH FROM to_timestamp(from_date)) = $1
    AND destination_name ILIKE $2
  ORDER BY price ASC, from_date ASC
  LIMIT $3 OFFSET $4
`;

      // console.log(month)
      const values = [parseInt(month, 10), `%${destination}%`, limit, offset];

      const result = await pool.query(query, values);

      const totalTrips =
        result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
      const totalPages = Math.ceil(totalTrips / limit);

      res.set("Cache-Control", "no-store"); // prevent 304 caching
      res.json({
        page: Number(page),
        limit: Number(limit),
        totalTrips,
        totalPages,
        data: result.rows.map(({ total_count, ...trip }) => trip),
      });
    } else {
      const page = parseInt(req.query.page) || 1;
      // const limit = 4;
      // const offset = (page - 1) * limit;

      // const destination = req.params.destination;
      const trips = await pool.query(
        "SELECT * FROM trips where destination_name = $1  ORDER BY price ASC LIMIT $2 OFFSET $3",
        [destination, limit, offset]
      );
      const countResult = await pool.query(
        "SELECT COUNT(*) FROM trips where destination_name = $1",
        [destination]
      );
      const totalRows = parseInt(countResult.rows[0].count);
      // console.log(totalRows)
      const totalPages = Math.ceil(totalRows / limit);

      res.json({
        page: page,
        totalPages: totalPages,
        data: trips.rows,
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
