import express from 'express';
import { refreshSchwabAccessToken, exchangeCodeForTokens, getSchwabAccountStatus } from '../controllers/schwabController.js';
import { protectRoute } from '../middleware/protectRoute.js';

const router = express.Router();

// POST /api/schwab/refresh
router.post('/refresh', protectRoute, refreshSchwabAccessToken);

// POST /api/schwab/authorize
router.post('/authorize', protectRoute, exchangeCodeForTokens);
router.get('/account', protectRoute, getSchwabAccountStatus);


export default router;
