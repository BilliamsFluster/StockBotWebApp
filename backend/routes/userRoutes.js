// routes/userRoutes.js
import express from 'express';
import { getUserProfile, updateUserProfile, updatePreferences, getPreferences, updateProfileValidation, updatePreferencesValidation } from '../controllers/userController.js';
import { protectRoute } from '../middleware/protectRoute.js';

const router = express.Router();

// User profile (identity info)
router.get('/profile', protectRoute, getUserProfile);
router.put('/profile', protectRoute, updateProfileValidation, updateUserProfile);


// User preferences (includes activeBroker)
router.put('/preferences', protectRoute, updatePreferencesValidation, updatePreferences);
router.get('/preferences', protectRoute, getPreferences);

export default router;
