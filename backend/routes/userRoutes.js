// routes/userRoutes.js
import express from 'express';
import { getUserProfile, updateUserProfile } from '../controllers/userController.js';
import { protectRoute } from '../middleware/protectRoute.js';

const router = express.Router();

router.get('/profile', protectRoute, getUserProfile);
router.put('/profile', protectRoute, updateUserProfile);

export default router;