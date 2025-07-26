import express from 'express';
import v1Routes from './v1/index.js';

const router = express.Router();

// mount the current API version
router.use('/v1', v1Routes);
// default to v1 when no version specified
router.use('/', v1Routes);

export default router;
