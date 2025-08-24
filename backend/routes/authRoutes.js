// routes/authRoutes.js
import express from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken
} from '../controllers/authController.js';
import { verifyOrigin } from '../middleware/verifyOrigin.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.post('/refresh', verifyOrigin, refreshAccessToken);

export default router;
