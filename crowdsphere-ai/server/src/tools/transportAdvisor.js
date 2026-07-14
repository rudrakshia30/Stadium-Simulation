/**
 * Transport advisor tool for Unity Arena.
 * Returns filtered, prioritised transport options based on preferences.
 *
 * @module tools/transportAdvisor
 */

import venue from '../data/venue.js';

/**
 * Get transport options matching preferences.
 *
 * @param {Object} [preferences]
 * @param {boolean} [preferences.accessible] - Return only accessible transport
 * @param {string} [preferences.type] - Filter by type (metro, bus, shuttle, taxi, accessible_transport, bicycle)
 * @param {string} [preferences.fromZone] - Current zone (used for ordering by proximity)
 * @param {Array<Object>} [transportState] - Current transport state from operations snapshot
 * @returns {Array<Object>}
 */
export function getTransportOptions(preferences = {}, transportState = []) {
  const { accessible, type } = preferences;

  // Build a lookup map from current transport state
  const statusMap = new Map(transportState.map((t) => [t.id, t]));

  let results = venue.transportPoints.filter((tp) => {
    if (accessible && !tp.accessible) return false;
    if (type && tp.type !== type) return false;
    return true;
  });

  // Merge with live status
  results = results.map((tp) => {
    const liveStatus = statusMap.get(tp.id);
    return {
      id: tp.id,
      name: tp.name,
      type: tp.type,
      accessible: tp.accessible,
      walkMinutes: tp.walkMinutes,
      direction: tp.direction,
      status: liveStatus?.status || 'operational',
      nextDeparture: liveStatus?.nextDeparture || null,
      frequency: liveStatus?.frequency || null,
      platform: liveStatus?.platform || null,
      notes: liveStatus?.notes || '',
    };
  });

  // Sort: operational first, then by walkMinutes
  results.sort((a, b) => {
    if (a.status === 'operational' && b.status !== 'operational') return -1;
    if (b.status === 'operational' && a.status !== 'operational') return 1;
    return (a.walkMinutes || 0) - (b.walkMinutes || 0);
  });

  return results;
}
