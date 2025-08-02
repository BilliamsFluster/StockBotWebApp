import express from 'express';
import { getActiveBrokerPortfolio } from '../controllers/brokerController.js';
import { protectRoute } from '../middleware/protectRoute.js';

const router = express.Router();

router.get('/portfolio', protectRoute, getActiveBrokerPortfolio);

export default router;
