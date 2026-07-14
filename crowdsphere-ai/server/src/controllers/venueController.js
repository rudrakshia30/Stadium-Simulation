/**
 * Venue data controller.
 *
 * @module controllers/venueController
 */

import venue from '../data/venue.js';

/**
 * GET /api/venue
 * Returns venue summary (not full graph for efficiency).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function getVenueData(req, res) {
  res.json({
    success: true,
    data: {
      name: venue.name,
      disclaimer: venue.disclaimer,
      capacity: venue.capacity,
      gates: venue.gates,
      sections: venue.sections,
      facilities: venue.facilities,
      transportPoints: venue.transportPoints,
      nodes: venue.graph.nodes,
    },
    requestId: req.id,
  });
}
