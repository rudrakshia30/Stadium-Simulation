/**
 * Venue data routes.
 * @module routes/venue
 */
import { Router } from 'express';
import { getVenueData } from '../controllers/venueController.js';
import { getRoute } from '../controllers/fanController.js';

const router = Router();
router.get('/', getVenueData);
router.get('/route', getRoute);

export default router;
