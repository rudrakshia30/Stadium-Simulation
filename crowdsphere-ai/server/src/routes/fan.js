/**
 * Fan assistant routes.
 * @module routes/fan
 */
import { Router } from 'express';
import { chat } from '../controllers/fanController.js';

const router = Router();
router.post('/chat', chat);

export default router;
