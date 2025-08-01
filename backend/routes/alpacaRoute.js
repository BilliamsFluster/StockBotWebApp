import express from 'express';
import { protectRoute } from '../middleware/protectRoute.js';
import {
  connectAlpaca,
  getAlpacaAccountStatus
} from '../controllers/alpacaController.js';

const router = express.Router();

// POST /api/alpaca/connect → Save Alpaca keys to DB after validation
router.post('/connect', protectRoute, connectAlpaca);

// GET /api/alpaca/account → Fetch account info from Alpaca API
router.get('/account', protectRoute, getAlpacaAccountStatus);

export default router;
