import express from "express";
import pool from "../db.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;
const router = express.Router();
const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

router.get("/", async (req, res) => {
  try {
    // const trips = await pool.query('select trips.*, trip_images.image from trips left join trip_images on trips.id = trip_images.item_id');
    const trips = await pool.query(
      "SELECT DISTINCT ON (destination_name) * FROM trips t WHERE t.price = ( SELECT MIN(price) FROM trips WHERE destination_name = t.destination_name ) ORDER BY t.destination_name;"
    );
    const dates = await pool.query(
      "SELECT destination_name, MIN(from_date) AS from_date, MAX(to_date) AS to_date FROM trips GROUP BY destination_name ORDER BY destination_name;"
    );
    console.log(11111, dates)
    for (const trip of trips.rows) {
      const getObjectParams = {
        Bucket: bucketName,
        Key: trip.destination_name,
      };
      const command = new GetObjectCommand(getObjectParams);
      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
      trip.imageUrl = url;
    }
    trips.rows = trips.rows.map((trip) => {
      dates.rows.forEach((item) => {
      //   if (item.from_date < trip.from_date)
      //     trip["from_month"] = item.from_date;
      //   if (item.to_date > trip.to_date) trip["to_month"] = item.to_date;
      if(trip.destination_name === item.destination_name) {
        trip['from_month'] = item.from_date;
        trip['to_month'] = item.to_date;
      }
      });
      return trip;
    });
    res.json({ trips: trips.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

    if(month) {
const query = `
  SELECT *, COUNT(*) OVER() AS total_count
  FROM trips
  WHERE EXTRACT(MONTH FROM to_timestamp(from_date)) = $1
    AND destination_name ILIKE $2
  ORDER BY price ASC, from_date ASC
  LIMIT $3 OFFSET $4
`;

// console.log(month)
const values = [
  parseInt(month, 10),
  `%${destination}%`,
  limit,
  offset,
];

  
const result = await pool.query(query, values);

const totalTrips = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
const totalPages = Math.ceil(totalTrips / limit);

res.set('Cache-Control', 'no-store'); // prevent 304 caching
res.json({
  page: Number(page),
  limit: Number(limit),
  totalTrips,
  totalPages,
  data: result.rows.map(({ total_count, ...trip }) => trip),
});
    }
    else {
              const page = parseInt(req.query.page) || 1;
    // const limit = 4;
    // const offset = (page - 1) * limit;

    // const destination = req.params.destination;
    const trips = await pool.query("SELECT * FROM trips where destination_name = $1  ORDER BY price ASC LIMIT $2 OFFSET $3", [destination, limit, offset]);
        const countResult = await pool.query("SELECT COUNT(*) FROM trips where destination_name = $1", [destination]);
    const totalRows = parseInt(countResult.rows[0].count);
    // console.log(totalRows)
    const totalPages = Math.ceil(totalRows / limit);

    res.json({
            page: page,
      totalPages: totalPages,
      data: trips.rows
    })
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
