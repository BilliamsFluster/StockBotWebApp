import express from 'express';
import authRoutes from '../authRoutes.js';
import userRoutes from '../userRoutes.js';
import jarvisRoutes from '../jarvisRoutes.js';
import schwabRoutes from '../schwabRoutes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/jarvis', jarvisRoutes);
router.use('/schwab', schwabRoutes);

export default router;
