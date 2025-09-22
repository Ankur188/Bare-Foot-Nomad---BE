import express, {json} from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import {dirname, join} from 'path';
import { fileURLToPath } from 'url';
import usersRourter from './routes/users.js';
import authRourter from './routes/auth.js';
import staticRouter from './routes/static-api.js';
import imgRouter from './routes/images.js';
import bookingRouter from './routes/booking.js'

// Allow all origins temporarily


dotenv.config();

const __dirName = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT | 5000;
// const corsOptions = {credentials: true, origin: process.env.URL || '*'};
app.use(cors({
  origin: "https://barefootnomads.netlify.app/",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));


// app.use(cors(corsOptions));
// app.use(json());
// Parse application/json
app.use(bodyParser.json({ limit: '20mb' }));

// Parse application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({ limit: '20mb', extended: true }));
app.use(cookieParser());

app.use('/', express.static(join(__dirName, 'public')));

app.use('/api/users', usersRourter);
app.use('/api/user', authRourter);
app.use('/api/trips', staticRouter);
app.use('/api/img', imgRouter);
app.use('/api/booking', bookingRouter);
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send("Something broke!");
});


app.listen(PORT, '0.0.0.0' , ()=>console.log(`server is listening on ${PORT}`));