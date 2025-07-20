// routes/authRoutes.js
import express from 'express';
import { registerUser, loginUser, refreshAccessToken } from '../controllers/authController.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/refresh', refreshAccessToken);


export default router;