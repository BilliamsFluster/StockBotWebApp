// routes/authRoutes.js
import express from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  registerValidation,
  loginValidation,
} from '../controllers/authController.js';

const router = express.Router();

router.post('/register', registerValidation, registerUser);
router.post('/login', loginValidation, loginUser);
router.post('/logout', logoutUser);
router.get('/refresh', refreshAccessToken);

export default router;
