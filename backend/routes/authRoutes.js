// routes/authRoutes.js
import express from 'express';
import { registerUser, loginUser, logoutUser, refreshAccessToken } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.get('/refresh', refreshAccessToken);


export default router;