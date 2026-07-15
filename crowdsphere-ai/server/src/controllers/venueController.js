/**
 * @module controllers/venueController
 * @description Venue metadata controller for CrowdSphere AI.
 *   Retrieves static structural and geographic data of Unity Arena.
 *   Only returns high-level summaries for efficiency rather than the full,
 *   uncompressed graph edges, saving bandwidth for mobile fan clients.
 *
 * @pr-changes
 *   - Implemented standard venue summary response.
 *   - Filtered output to include name, capacity, gates, sections, facilities,
 *     transport points, and node list.
 *
 * @validation-review
 *   - Static venue data is read from import; if venue changes, a backend restart
 *     is required.
 *   - Request does not accept query params; all clients receive the identical payload.
 *
 * @business-intent
 *   Provides the browser UI with the raw metadata needed to draw map points,
 *   amenity directories, and entry plazas correctly.
 */

import venue from '../data/venue.js';

/**
 * GET /api/venue
 * Retrieve structural venue metadata for map and directory rendering.
 *
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {void}
 *
 * @business-intent
 *   Loads stadium capacity and facility structures for display on dashboard.
 */
export function getVenueData(req, res) {
  // #What — Return standard venue catalogue details; uncompressed graph edges are omitted
  //         to optimize mobile data usage during events.
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
