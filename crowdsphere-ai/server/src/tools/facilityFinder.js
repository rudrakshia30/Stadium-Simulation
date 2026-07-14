/**
 * Facility finder tool for Unity Arena.
 * Searches venue facilities by type and accessibility preference.
 *
 * @module tools/facilityFinder
 */

import venue from '../data/venue.js';

/**
 * Find facilities matching the given criteria.
 *
 * @param {string} type - Facility type (e.g. 'toilet', 'medical', 'water_refill')
 * @param {Object} [options]
 * @param {boolean} [options.accessible] - If true, return only accessible facilities
 * @param {string} [options.nearZone] - Prefer facilities in or near this zone
 * @param {number} [options.limit] - Maximum number of results
 * @returns {Array<Object>}
 */
export function findFacilities(type, options = {}) {
  const { accessible, nearZone, limit = 10 } = options;

  let results = venue.facilities.filter((f) => {
    if (type && f.type !== type) return false;
    if (accessible && !f.accessible) return false;
    return true;
  });

  // Sort: zone-matching facilities first
  if (nearZone) {
    results = results.sort((a, b) => {
      const aMatch = a.zone === nearZone ? -1 : 1;
      const bMatch = b.zone === nearZone ? -1 : 1;
      return aMatch - bMatch;
    });
  }

  return results.slice(0, limit).map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    zone: f.zone,
    level: f.level,
    accessible: f.accessible,
    operational: f.operational !== false,
    x: f.x,
    y: f.y,
  }));
}

/**
 * Find all facility types available in the venue.
 * @returns {string[]}
 */
export function getAvailableFacilityTypes() {
  return [...new Set(venue.facilities.map((f) => f.type))];
}
