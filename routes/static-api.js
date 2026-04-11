import express from "express";
import pool from "../db.js";
import dotenv from "dotenv";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

dotenv.config();

const router = express.Router();

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

async function getRandomTripImageUrl(bucketName, tripName) {
  // List all images for the trip and pick a random one (excluding itinerary files)
  try {
    const sanitizedName = tripName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `trips/${sanitizedName}_`
    });
    
    const listResult = await s3.send(listCommand);
    
    if (listResult.Contents && listResult.Contents.length > 0) {
      // Filter out itinerary files
      const imageFiles = listResult.Contents.filter(obj => 
        !obj.Key.toLowerCase().includes('itinerary')
      );
      
      if (imageFiles.length === 0) {
        throw new Error('No images found for trip');
      }
      
      // Pick a random image
      const randomIndex = Math.floor(Math.random() * imageFiles.length);
      const randomImage = imageFiles[randomIndex];
      
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: randomImage.Key,
      });
      return await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour
    }
    
    throw new Error('No images found for trip');
  } catch (error) {
    throw error;
  }
}

async function getRandomTripImages(bucketName, tripName, count = 3) {
  // List all images for the trip and pick random ones (excluding itinerary files)
  try {
    const sanitizedName = tripName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `trips/${sanitizedName}_`
    });
    
    const listResult = await s3.send(listCommand);
    
    if (listResult.Contents && listResult.Contents.length > 0) {
      // Filter out itinerary files
      const imageFiles = listResult.Contents.filter(obj => 
        !obj.Key.toLowerCase().includes('itinerary')
      );
      
      if (imageFiles.length === 0) {
        throw new Error('No images found for trip');
      }
      
      // Shuffle array and pick up to 'count' images
      const shuffled = [...imageFiles].sort(() => 0.5 - Math.random());
      const selectedImages = shuffled.slice(0, Math.min(count, imageFiles.length));
      
      // Generate signed URLs for all selected images
      const imageUrls = await Promise.all(
        selectedImages.map(async (image) => {
          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: image.Key,
          });
          return await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour
        })
      );
      
      return imageUrls;
    }
    
    throw new Error('No images found for trip');
  } catch (error) {
    throw error;
  }
}

async function getAllTripImages(bucketName, tripName) {
  // Get ALL images for the trip (excluding itinerary files)
  try {
    const sanitizedName = tripName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `trips/${sanitizedName}_`
    });
    
    const listResult = await s3.send(listCommand);
    
    if (listResult.Contents && listResult.Contents.length > 0) {
      // Filter out itinerary files
      const imageFiles = listResult.Contents.filter(obj => 
        !obj.Key.toLowerCase().includes('itinerary')
      );
      
      if (imageFiles.length === 0) {
        throw new Error('No images found for trip');
      }
      
      // Generate signed URLs for ALL images
      const imageUrls = await Promise.all(
        imageFiles.map(async (image) => {
          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: image.Key,
          });
          return await getSignedUrl(s3, command, { expiresIn: 3600 }); // 1 hour
        })
      );
      
      return imageUrls;
    }
    
    throw new Error('No images found for trip');
  } catch (error) {
    throw error;
  }
}

async function getTripItineraryKey(bucketName, tripName) {
  // Get the itinerary file key for the trip
  try {
    const sanitizedName = tripName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: `trips/${sanitizedName}_`
    });
    
    const listResult = await s3.send(listCommand);
    
    if (listResult.Contents && listResult.Contents.length > 0) {
      // Find the itinerary file
      const itineraryFile = listResult.Contents.find(obj => 
        obj.Key.toLowerCase().includes('itinerary')
      );
      
      if (!itineraryFile) {
        throw new Error('No itinerary file found for trip');
      }
      
      return {
        key: itineraryFile.Key,
        filename: itineraryFile.Key.split('/').pop() // Extract filename from key
      };
    }
    
    throw new Error('No itinerary file found for trip');
  } catch (error) {
    throw error;
  }
}


// Route to get all trips with earliest and latest batch dates
router.get("/", async (req, res) => {
  try {
    // Fetch all trips with the batch that has the lowest price, plus earliest and latest dates
    const tripsResult = await pool.query(
      `SELECT 
         t.*,
         b.id AS batch_id,
         b.from_date AS batch_from_date,
         b.to_date AS batch_to_date,
         b.price AS batch_price,
         b.max_adventurers AS batch_max_adventurers,
         b.batch_name,
         b.created_at AS batch_created_at,
         b.single_room AS batch_single_room,
         b.double_room AS batch_double_room,
         b.triple_room AS batch_triple_room,
         date_agg.earliest_from_date,
         date_agg.latest_to_date
       FROM trips t
       LEFT JOIN LATERAL (
         SELECT * FROM batches 
         WHERE trip_id = t.id AND status = true AND from_date > EXTRACT(EPOCH FROM NOW())
         ORDER BY price ASC, from_date ASC
         LIMIT 1
       ) b ON true
       LEFT JOIN (
         SELECT 
           trip_id,
           MIN(from_date) AS earliest_from_date,
           MAX(to_date) AS latest_to_date
         FROM batches
         WHERE status = true
         GROUP BY trip_id
       ) date_agg ON date_agg.trip_id = t.id
       WHERE t.status = true
       ORDER BY t.destination_name;`
    );
    
    console.log('trips with lowest price batch', tripsResult.rows);

    // Transform the data to nest batch information as an object
    const trips = tripsResult.rows.map(row => {
      // Extract batch fields
      const lowestPriceBatch = row.batch_id ? {
        id: row.batch_id,
        from_date: row.batch_from_date,
        to_date: row.batch_to_date,
        price: row.batch_price,
        max_adventurers: row.batch_max_adventurers,
        batch_name: row.batch_name,
        single_room: row.batch_single_room,
        double_room: row.batch_double_room,
        triple_room: row.batch_triple_room,
        created_at: row.batch_created_at,
      } : null;

      // Create trip object without batch fields
      const trip = {
        id: row.id,
        destination_name: row.destination_name,
        status: row.status,
        // Add any other trip fields from the trips table here
      };

      // Copy any other fields from trips table that aren't batch-related
      for (const key in row) {
        if (!key.startsWith('batch_') && 
            key !== 'earliest_from_date' && 
            key !== 'latest_to_date' &&
            !trip.hasOwnProperty(key)) {
          trip[key] = row[key];
        }
      }
      

      // Add the nested batch object and date range
      trip.lowestPriceBatch = lowestPriceBatch;
      trip.from_month = row.earliest_from_date; // For backward compatibility
      trip.to_month = row.latest_to_date; // For backward compatibility

      return trip;
    });

    // Attach presigned image URL to each trip
    for (const trip of trips) {
      try {
        // Get a random image from S3 for this trip
        trip.imageUrl = await getRandomTripImageUrl(
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

    res.json({ trips });
  } catch (err) {
    console.error("Error fetching trips:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/enquire", async (req, res) => {
  try {
    // console.log('req', req.body)
    await pool.query(
      "insert into leads (type, name , location, travellers, days, email, phone, message, budget, date, created_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
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
        req.body.date,
        req.body.createdAt,
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
    
    // Fetch trip details with the batch that has the lowest price, plus earliest and latest dates
    const tripResult = await pool.query(
      `SELECT 
         t.*,
         b.id AS batch_id,
         b.from_date AS batch_from_date,
         b.to_date AS batch_to_date,
         b.price AS batch_price,
         b.max_adventurers AS batch_max_adventurers,
         b.batch_name,
         b.single_room AS batch_single_room,
         b.double_room AS batch_double_room,
         b.triple_room AS batch_triple_room,
         date_agg.earliest_from_date,
         date_agg.latest_to_date
       FROM trips t
       LEFT JOIN LATERAL (
         SELECT * FROM batches 
         WHERE trip_id = t.id AND status = true AND from_date > EXTRACT(EPOCH FROM NOW())
         ORDER BY price ASC, from_date ASC
         LIMIT 1
       ) b ON true
       LEFT JOIN (
         SELECT 
           trip_id,
           MIN(from_date) AS earliest_from_date,
           MAX(to_date) AS latest_to_date
         FROM batches
         WHERE status = true
         GROUP BY trip_id
       ) date_agg ON date_agg.trip_id = t.id
       WHERE t.id = $1 AND t.status = true;`,
      [tripId]
    );

    if (tripResult.rows.length === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    const row = tripResult.rows[0];

    // Extract batch fields into a separate object
    const lowestPriceBatch = row.batch_id ? {
      id: row.batch_id,
      from_date: row.batch_from_date,
      to_date: row.batch_to_date,
      price: row.batch_price,
      max_adventurers: row.batch_max_adventurers,
      batch_name: row.batch_name,
      single_room: row.batch_single_room,
      double_room: row.batch_double_room,
      triple_room: row.batch_triple_room
    } : null;

    // Create trip object without batch fields
    const trip = {
      id: row.id,
      destination_name: row.destination_name,
      status: row.status,
    };

    // Copy any other fields from trips table that aren't batch-related
    for (const key in row) {
      if (!key.startsWith('batch_') && 
          key !== 'earliest_from_date' && 
          key !== 'latest_to_date' &&
          !trip.hasOwnProperty(key)) {
        trip[key] = row[key];
      }
    }

    // Add the nested batch object and date range
    trip.lowestPriceBatch = lowestPriceBatch;
    trip.start = row.earliest_from_date;
    trip.end = row.latest_to_date;
    trip.from_month = row.earliest_from_date;
    trip.to_month = row.latest_to_date;

    // Add image URLs (3 random images for display + all images for lightbox)
    try {
      // Get 3 random images from S3 for this trip (for main display)
      trip.images = await getRandomTripImages(
        bucketName,
        trip.destination_name,
        3
      );
      // Get ALL images for the lightbox
      trip.allImages = await getAllTripImages(
        bucketName,
        trip.destination_name
      );
      // Keep backward compatibility with single imageUrl
      trip.imageUrl = trip.images.length > 0 ? trip.images[0] : null;
    } catch (err) {
      console.error("Failed to generate signed URLs for", trip.destination_name, err);
      trip.images = [];
      trip.allImages = [];
      trip.imageUrl = null;
    }

    res.json(trip);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Route to download itinerary file for a trip (streams from S3)
router.get("/:id/itinerary", async (req, res) => {
  try {
    const tripId = req.params.id;
    
    // First get the trip name from the database
    const tripResult = await pool.query(
      `SELECT destination_name FROM trips WHERE id = $1 AND status = true;`,
      [tripId]
    );

    if (tripResult.rows.length === 0) {
      return res.status(404).json({ error: "Trip not found" });
    }

    const tripName = tripResult.rows[0].destination_name;

    // Get the itinerary file key from S3
    try {
      const itineraryData = await getTripItineraryKey(bucketName, tripName);
      
      // Get the file from S3
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: itineraryData.key,
      });
      
      const s3Response = await s3.send(command);
      
      // Set headers for file download
      res.setHeader('Content-Type', s3Response.ContentType || 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${itineraryData.filename}"`);
      res.setHeader('Content-Length', s3Response.ContentLength);
      
      // Stream the file to the response
      s3Response.Body.pipe(res);
      
    } catch (err) {
      console.error("Failed to get itinerary for", tripName, err);
      return res.status(404).json({ error: "Itinerary file not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/:id/batches", async (req, res) => {
  try {
    const tripId = req.params.id;
    const { month, page = 1 } = req.query;
    const limit = 4;
    const offset = (page - 1) * limit;

    if (month) {
      // Filter by month and trip_id
      const query = `
        SELECT b.*, 
               COALESCE((SELECT SUM(travellers) FROM bookings WHERE batch_id = b.id), 0)::integer as total_bookings,
               COUNT(*) OVER() AS total_count
        FROM batches b
        WHERE b.trip_id = $1
          AND b.status = true
          AND b.from_date > EXTRACT(EPOCH FROM NOW())
          AND EXTRACT(MONTH FROM to_timestamp(b.from_date)) = $2
        ORDER BY b.price ASC, b.from_date ASC
        LIMIT $3 OFFSET $4
      `;

      const values = [tripId, parseInt(month, 10), limit, offset];
      const result = await pool.query(query, values);

      const totalBatches =
        result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
      const totalPages = Math.ceil(totalBatches / limit);

      res.set("Cache-Control", "no-store"); // prevent 304 caching
      res.json({
        page: Number(page),
        limit: Number(limit),
        totalBatches,
        totalPages,
        data: result.rows.map(({ total_count, ...batch }) => batch),
      });
    } else {
      // Get all upcoming batches for this trip_id
      const batches = await pool.query(
        `SELECT *, 
                COALESCE((SELECT SUM(travellers) FROM bookings WHERE batch_id = batches.id), 0)::integer as total_bookings
         FROM batches 
         WHERE trip_id = $1 
           AND status = true
           AND from_date > EXTRACT(EPOCH FROM NOW())
         ORDER BY price ASC, from_date ASC 
         LIMIT $2 OFFSET $3`,
        [tripId, limit, offset]
      );
      
      const countResult = await pool.query(
        `SELECT COUNT(*) FROM batches 
         WHERE trip_id = $1 
           AND status = true
           AND from_date > EXTRACT(EPOCH FROM NOW())`,
        [tripId]
      );
      
      const totalRows = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(totalRows / limit);

      res.json({
        page: Number(page),
        totalPages: totalPages,
        totalBatches: totalRows,
        data: batches.rows,
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
