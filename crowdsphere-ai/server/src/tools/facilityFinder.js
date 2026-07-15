/**
 * @module tools/facilityFinder
 * @description Venue facility search tool for Unity Arena. Searches the static
 *   facility catalogue by type and accessibility preference, with optional
 *   zone-proximity sorting. Exposes two functions: findFacilities() for
 *   filtered, ranked results and getAvailableFacilityTypes() for discovery.
 *
 *   This tool operates entirely on the static venue data import and is safe to
 *   call without any live state. It is invoked by the tool registry in index.js
 *   when Gemini issues a `getFacilityLocations` function call.
 *
 * @pr-changes Initial implementation. Accessibility filter applied before zone
 *   sort to reduce unnecessary comparisons. operational field defaults to true
 *   when absent (f.operational !== false) to handle legacy facility records that
 *   predate the operational flag. Limit capped at 10 by default. Coordinate
 *   fields (x, y) included in output for frontend map rendering.
 *
 * @validation-review
 *   - `type` is required in the Zod schema in index.js but treated as optional
 *     here (guarded with `if (type && ...)`). The two layers should stay in sync.
 *   - `limit` defaults to 10 here; Zod schema enforces max 20. No server-side
 *     re-enforcement of max here — relies on upstream Zod validation.
 *   - Accessible flag from venue data is a boolean; undefined is coerced to
 *     false. If a facility record has no `accessible` key, it will be treated
 *     as not accessible (correct behaviour).
 *   - nearZone sort is a simple boolean comparison (-1 / 1), not a true
 *     distance-based sort. Facilities in adjacent zones are treated as remote.
 *
 * @scope-of-improvement
 *   - nearZone could use actual coordinate distance (Euclidean from zone centroid)
 *     to produce a true proximity ranking rather than a binary match.
 *   - Results could be filtered by `operational: true` by default, with an
 *     explicit option to include non-operational facilities for ops staff.
 *   - Caching the facility list (already static) is trivially effective since
 *     venue.facilities never changes at runtime.
 *   - Multi-type search (e.g. ['toilet', 'water_refill']) is not supported;
 *     callers must issue separate requests per type.
 *
 * @business-intent Enables fans and operations staff to quickly locate specific
 *   services (medical stations, accessible toilets, water refill points) within
 *   the venue. Accessibility filtering is legally mandated for assistive technology
 *   compliance — accessible facility discovery must always be accurate.
 */

import venue from '../data/venue.js';

/**
 * Find facilities in Unity Arena matching the given type and options.
 *
 * @description Filters the full venue facilities list by type and optional
 *   accessibility requirement, optionally sorts results so that facilities in
 *   the target zone appear first, and truncates to the requested limit.
 *   Returns a normalised projection of each matching facility record.
 *
 * @param {string} type - Facility type to search for (e.g. 'toilet', 'medical',
 *   'water_refill', 'first_aid', 'information_desk').
 * @param {Object} [options] - Additional search filters.
 * @param {boolean} [options.accessible] - If true, return only accessible-tagged facilities.
 * @param {string} [options.nearZone] - Zone ID; matching facilities are sorted to the top.
 * @param {number} [options.limit=10] - Maximum number of results to return (max 20 via schema).
 * @returns {Array<Object>} Array of normalised facility objects with id, name, type,
 *   zone, level, accessible, operational, x, y fields.
 *
 * @business-intent Fans need immediate access to nearby facilities during events.
 *   Medical facility lookup in particular is time-sensitive — result accuracy and
 *   operational status correctness can directly affect fan welfare.
 *
 * @validation-note `operational` defaults to `true` when the field is absent on
 *   a facility record (f.operational !== false), preserving backwards compatibility
 *   with legacy venue data that lacks the field.
 */
export function findFacilities(type, options = {}) {
  const { accessible, nearZone, limit = 10 } = options;

  // #What — apply type and accessibility filters; both are independent AND conditions
  let results = venue.facilities.filter((f) => {
    if (type && f.type !== type) return false;   // #What — type filter (falsy type = show all types)
    if (accessible && !f.accessible) return false; // #Business-Intent — accessible filter is strict; any non-accessible facility is excluded
    return true;
  });

  // #What — sort zone-matching facilities to the front of the results list
  if (nearZone) {
    // #Uncertain — binary comparison (-1/1) means all non-matching zones are
    //   treated as equally "far away" regardless of physical proximity
    results = results.sort((a, b) => {
      const aMatch = a.zone === nearZone ? -1 : 1;
      const bMatch = b.zone === nearZone ? -1 : 1;
      return aMatch - bMatch;
    });
  }

  // #What — slice to limit and project only the fields needed by the frontend/AI
  return results.slice(0, limit).map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    zone: f.zone,
    level: f.level,
    accessible: f.accessible,
    // #What — treat absence of operational flag as operational=true for legacy data compatibility
    operational: f.operational !== false,
    x: f.x, // #What — coordinate for frontend map pin rendering
    y: f.y, // #What — coordinate for frontend map pin rendering
  }));
}

/**
 * Return all unique facility types available in the venue.
 *
 * @description Extracts the `type` field from every facility record and
 *   deduplicates using a Set. Useful for populating filter dropdowns in the UI
 *   and for Gemini to discover what facility types it can request.
 *
 * @returns {string[]} Array of unique facility type strings.
 *
 * @business-intent Provides a dynamic, data-driven list of facility categories
 *   so the UI remains accurate even when the venue data is updated (e.g. new
 *   facility types added for special events).
 */
export function getAvailableFacilityTypes() {
  // #What — Set deduplication removes repeated type values from the flat map
  return [...new Set(venue.facilities.map((f) => f.type))];
}
