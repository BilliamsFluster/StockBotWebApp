// routes/userRoutes.js
import express from 'express';
import { getUserProfile, updateUserProfile, updatePreferences, getPreferences } from '../controllers/userController.js';
import { protectRoute } from '../middleware/protectRoute.js';

const router = express.Router();

router.get('/profile', protectRoute, getUserProfile);
router.put('/profile', protectRoute, updateUserProfile);
router.put('/preferences', protectRoute, updatePreferences);
router.get('/preferences', protectRoute, getPreferences);

export default router;