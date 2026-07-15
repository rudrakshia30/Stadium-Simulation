/**
 * @module tools/transportAdvisor
 * @description Transport advisor tool for Unity Arena.
 *   Returns filtered, prioritised transport options based on user preferences
 *   and real-time transport status from the operations snapshot.
 *
 *   This is a deterministic tool invoked by the tool registry in index.js
 *   when Gemini issues a `getTransportOptions` function call. Gemini may narrate or
 *   summarise the options, but the status and departure times are always calculated
 *   deterministically from the server state.
 *
 * @pr-changes
 *   - Implemented `getTransportOptions()` with type and accessibility filtering.
 *   - Merged static transport points with live status from `transportState`.
 *   - Added sorting so that operational services are prioritised, followed by
 *     walking time in minutes.
 *   - Standardised the return properties (frequency, platform, nextDeparture, etc.).
 *
 * @validation-review
 *   - `statusMap` is created from `transportState` parameters; unknown transport point
 *     IDs default to status `'operational'` to degrade gracefully if state is partial.
 *   - Boolean filters like `accessible` are checked strictly.
 *   - Sort comparator uses `walkMinutes` subtraction; if a transport point record is
 *     missing the `walkMinutes` property, it is coerced to 0 (`a.walkMinutes || 0`).
 *
 * @scope-of-improvement
 *   - Add physical distance check from the fan's current zone (using graph nodes)
 *     instead of a static `walkMinutes` estimate.
 *   - Implement multi-language translations for transport notes.
 *   - Add real-time passenger density (congestion level) for metro/bus stops.
 *
 * @business-intent
 *   Safe crowd dispersal at the end of matches directly affects the venue's overall safety
 *   posture. Directing fans to delayed or disrupted services causes platform crowding
 *   and frustration. Real-time transport status integration helps steer crowds toward
 *   available alternatives.
 */

import venue from '../data/venue.js';

/**
 * Get transport options matching the requested preferences and live state.
 *
 * @description Filters the static transport points catalogue by type and accessibility,
 *   merges each point with live status from the operations snapshot, and sorts them
 *   so that operational options are shown first, sorted by estimated walking time.
 *
 * @param {Object} [preferences={}] - Search preferences.
 * @param {boolean} [preferences.accessible] - Return only wheelchair-accessible options.
 * @param {string} [preferences.type] - Filter by transport type (metro, bus, shuttle, taxi, accessible_transport, bicycle).
 * @param {string} [preferences.fromZone] - Currently unused; placeholder for proximity calculations.
 * @param {Array<Object>} [transportState=[]] - Real-time transport statuses from operations snapshot.
 * @returns {Array<Object>} Sorted list of transport options with live status metadata.
 *
 * @business-intent
 *   Ensures that mobility-impaired fans receive only accessible transport services
 *   and helps all fans choose active, operational services during egress.
 */
export function getTransportOptions(preferences = {}, transportState = []) {
  const { accessible, type } = preferences;

  // #What — Build a lookup map of live transport states keyed by transport ID.
  const statusMap = new Map(transportState.map((t) => [t.id, t]));

  // #What — Filter static transport points based on accessibility and type.
  let results = venue.transportPoints.filter((tp) => {
    if (accessible && !tp.accessible) return false; // #Business-Intent — Accessible filter is strict to avoid routing disabled fans to inaccessible stops.
    if (type && tp.type !== type) return false;
    return true;
  });

  // #What — Merge static catalogue info with real-time status and departure info from snapshot.
  results = results.map((tp) => {
    const liveStatus = statusMap.get(tp.id);
    return {
      id: tp.id,
      name: tp.name,
      type: tp.type,
      accessible: tp.accessible,
      walkMinutes: tp.walkMinutes,
      direction: tp.direction,
      // #What — Fallback to 'operational' if no live status is found in the snapshot.
      status: liveStatus?.status || 'operational',
      nextDeparture: liveStatus?.nextDeparture || null,
      frequency: liveStatus?.frequency || null,
      platform: liveStatus?.platform || null,
      notes: liveStatus?.notes || '',
    };
  });

  // ── Sort results: operational first, then by walkMinutes ───────────────────
  // #Business-Intent — Disrupted services are pushed to the bottom of the list
  //   so users do not select them by default.
  results.sort((a, b) => {
    if (a.status === 'operational' && b.status !== 'operational') return -1;
    if (b.status === 'operational' && a.status !== 'operational') return 1;
    return (a.walkMinutes || 0) - (b.walkMinutes || 0);
  });

  return results;
}
