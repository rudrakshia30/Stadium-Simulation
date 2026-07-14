/**
 * Volunteer availability tracker for Unity Arena.
 * Returns simulated volunteer coverage per zone.
 *
 * @module tools/volunteerTracker
 */

/** Baseline volunteer allocation per zone */
const BASELINE_VOLUNTEERS = {
  'zone-north-concourse': { total: 8, available: 7 },
  'zone-east-concourse': { total: 6, available: 6 },
  'zone-south-concourse': { total: 6, available: 5 },
  'zone-west-concourse': { total: 6, available: 6 },
  'zone-accessible-hub': { total: 4, available: 4 },
  'zone-gate-a-plaza': { total: 4, available: 3 },
  'zone-gate-b-plaza': { total: 4, available: 4 },
  'zone-gate-c-plaza': { total: 3, available: 3 },
  'zone-gate-d-plaza': { total: 3, available: 3 },
};

/** Minimum coverage threshold */
const MIN_COVERAGE = 0.6;

/**
 * Get volunteer availability for a specific zone or all zones.
 *
 * @param {string} [zone] - Optional zone ID to filter
 * @param {Object} [scenarioAdjustments] - Optional per-zone adjustments from scenario
 * @returns {{ zones: Array<Object>, totalAvailable: number, totalRequired: number, shortage: boolean }}
 */
export function getVolunteerAvailability(zone, scenarioAdjustments = {}) {
  const entries = zone
    ? Object.entries(BASELINE_VOLUNTEERS).filter(([id]) => id === zone)
    : Object.entries(BASELINE_VOLUNTEERS);

  const zones = entries.map(([id, base]) => {
    const adj = scenarioAdjustments[id] || {};
    const available = adj.available ?? base.available;
    const total = adj.total ?? base.total;
    const coverageRatio = total > 0 ? available / total : 1;
    const shortage = coverageRatio < MIN_COVERAGE;

    return {
      zoneId: id,
      zoneName: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      available,
      total,
      coverageRatio: Math.round(coverageRatio * 100) / 100,
      shortage,
      status: shortage ? 'below-threshold' : 'adequate',
    };
  });

  const totalAvailable = zones.reduce((sum, z) => sum + z.available, 0);
  const totalRequired = zones.reduce((sum, z) => sum + z.total, 0);
  const anyShortage = zones.some((z) => z.shortage);

  return {
    zones,
    totalAvailable,
    totalRequired,
    shortage: anyShortage,
  };
}
