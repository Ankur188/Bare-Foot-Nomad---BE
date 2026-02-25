import express from 'express';
import tripsRouter from './admin/trips.js';
import batchesRouter from './admin/batches.js';
import usersRouter from './admin/users.js';
import couponsRouter from './admin/coupons.js';
import bannersRouter from './admin/banners.js';

const router = express.Router();

// Mount sub-routers
router.use('/trips', tripsRouter);
router.use('/batches', batchesRouter);
router.use('/users', usersRouter);
router.use('/coupons', couponsRouter);
router.use('/banners', bannersRouter);

export default router;
