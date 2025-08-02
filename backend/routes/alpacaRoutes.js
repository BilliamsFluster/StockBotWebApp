import express from 'express';
import { protectRoute } from '../middleware/protectRoute.js';
import {
  connectAlpaca,
  getAlpacaAccountStatus, 
  disconnectAlpacaAPI,
  getAlpacaStatus
} from '../controllers/alpacaController.js';

const router = express.Router();

// POST /api/alpaca/connect → Save Alpaca keys to DB after validation
router.post('/connect', protectRoute, connectAlpaca);

// GET /api/alpaca/account → Fetch account info from Alpaca API
router.get('/account', protectRoute, getAlpacaAccountStatus);

router.get('/status', protectRoute, getAlpacaStatus);

router.post('/disconnect', protectRoute, disconnectAlpacaAPI)


export default router;
