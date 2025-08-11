import express from 'express';
import { refreshSchwabAccessToken, exchangeCodeForTokens, 
    getSchwabAccountStatus, checkSchwabCredentials, setSchwabCredentials, disconnectSchwabAPI } from '../controllers/schwabController.js';
import { protectRoute } from '../middleware/protectRoute.js';

const router = express.Router();

// POST /api/schwab/refresh
router.post('/refresh', protectRoute, refreshSchwabAccessToken);

// POST /api/schwab/authorize
router.post('/authorize', protectRoute, exchangeCodeForTokens);
router.get('/account', protectRoute, getSchwabAccountStatus);
router.get('/status', protectRoute, getSchwabAccountStatus);

router.post('/set-credentials', protectRoute, setSchwabCredentials)
router.post('/disconnect', protectRoute, disconnectSchwabAPI)
router.get('/check-credentials', protectRoute, checkSchwabCredentials)


export default router;
