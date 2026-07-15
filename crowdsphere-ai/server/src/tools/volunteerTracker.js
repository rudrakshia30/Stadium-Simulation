/**
 * @module tools/volunteerTracker
 * @description Volunteer coverage tracker for Unity Arena events.
 *   Provides per-zone and aggregate volunteer availability data, comparing
 *   actual staffing against a minimum coverage threshold to surface shortages.
 *   Data is based on a static baseline allocation that can be overridden by
 *   scenario-specific adjustments to simulate real-world staffing changes.
 *
 *   This module is a deterministic tool invocable by Gemini during operations
 *   brief generation. Gemini may interpret the shortage status and recommend
 *   redeployment actions, but the actual availability numbers are authoritative
 *   server-side data, never AI-generated.
 *
 * @pr-changes
 *   - Introduced `scenarioAdjustments` parameter to allow scenario data to
 *     override baseline allocation without modifying the constant directly.
 *   - Added `coverageRatio`, `shortage`, and `status` fields to each zone
 *     result for richer downstream display in the ops dashboard.
 *   - `totalRequired` and aggregate `shortage` boolean added to the return
 *     value for quick summary panel integration.
 *   - Zone name is now derived from zoneId by replacing hyphens with spaces
 *     and title-casing, removing the need for a separate name lookup table.
 *
 * @validation-review
 *   - BASELINE_VOLUNTEERS is a static constant; it does not reflect real-time
 *     check-ins or volunteer absences. In production this should be replaced
 *     with a live staffing API or database query.
 *   - The `zone` filter parameter is matched by exact string equality against
 *     BASELINE_VOLUNTEERS keys; a typo or unknown zone ID returns an empty
 *     zones array (not an error). Callers should handle the empty array case.
 *   - `MIN_COVERAGE` (0.6) is a hardcoded threshold; different venue contracts
 *     may require different minimum ratios. Consider externalising to config.
 *   - `scenarioAdjustments` values (`adj.available`, `adj.total`) are used
 *     without type validation; passing non-numeric values would produce NaN
 *     in `coverageRatio`.
 *
 * @scope-of-improvement
 *   - Replace BASELINE_VOLUNTEERS with a real-time staffing integration
 *     (e.g. event management system API) for production deployments.
 *   - Add a `redeploymentSuggestions` field listing specific zones that could
 *     donate volunteers to shortage zones based on their current risk scores.
 *   - Expose MIN_COVERAGE as a config value (`config.minVolunteerCoverage`)
 *     for per-venue configuration without code changes.
 *   - Add a `lastUpdatedAt` timestamp to the response so consumers can detect
 *     stale data in long-running operations without scenario changes.
 *
 * @business-intent
 *   Volunteer coverage directly affects the venue's ability to respond to crowd
 *   safety incidents. A shortage in a high-occupancy zone reduces the ops team's
 *   response capacity when it matters most. Surfacing this data proactively in
 *   the operations brief allows managers to redeploy volunteers pre-emptively,
 *   before a shortage becomes a safety incident.
 */

/**
 * Baseline volunteer allocation per zone, keyed by zone ID.
 * `total` is the scheduled headcount; `available` is the currently on-duty count.
 *
 * @type {Record<string, { total: number, available: number }>}
 *
 * @risk-area This is SIMULATED DATA for demonstration purposes. In production
 *   this MUST be replaced with a live staffing system integration or the ops
 *   team will act on incorrect volunteer counts during real emergencies.
 *
 * @business-intent Baseline allocations are set based on venue capacity and
 *   historical event staffing plans. Higher-capacity zones (north concourse)
 *   receive more volunteers proportionally.
 */
const BASELINE_VOLUNTEERS = {
  'zone-north-concourse': { total: 8, available: 7 },
  'zone-east-concourse': { total: 6, available: 6 },
  'zone-south-concourse': { total: 6, available: 5 },
  'zone-west-concourse': { total: 6, available: 6 },
  'zone-accessible-hub': { total: 4, available: 4 },  // #Business-Intent — Accessible hub staffed at 100% to ensure accessibility support is never understaffed
  'zone-gate-a-plaza': { total: 4, available: 3 },
  'zone-gate-b-plaza': { total: 4, available: 4 },
  'zone-gate-c-plaza': { total: 3, available: 3 },
  'zone-gate-d-plaza': { total: 3, available: 3 },
};

/**
 * Minimum acceptable coverage ratio (available / total) below which a zone
 * is flagged as having a shortage requiring operational attention.
 *
 * @type {number}
 * @business-intent 60% coverage is the minimum accepted by venue safety policy.
 *   Below this threshold the operations manager must redeploy or request backup.
 */
const MIN_COVERAGE = 0.6;

/**
 * Get volunteer availability for a specific zone or all zones.
 *
 * @description Iterates over the baseline volunteer allocations, applies any
 *   scenario-specific adjustments, computes the coverage ratio per zone, and
 *   flags zones below the minimum coverage threshold. Returns aggregate totals
 *   and an overall shortage flag for dashboard summary display.
 *
 * @param {string} [zone] - Optional zone ID to filter results to a single zone.
 *   If omitted or undefined, returns data for all zones.
 * @param {Record<string, { available?: number, total?: number }>} [scenarioAdjustments={}]
 *   Optional per-zone overrides for the baseline numbers. Used by scenarios
 *   to simulate staffing changes without modifying the baseline constant.
 * @returns {{ zones: Array<Object>, totalAvailable: number, totalRequired: number, shortage: boolean }}
 *   Per-zone details plus aggregate metrics.
 *
 * @validation-note
 *   If `zone` is supplied but not found in BASELINE_VOLUNTEERS, `zones` will
 *   be an empty array and `shortage` will be `false`. Callers should check for
 *   empty arrays before displaying zone-level data.
 *
 * @business-intent
 *   Providing a zone-specific view (via the `zone` parameter) allows the Gemini
 *   tool to efficiently query a single zone's coverage during an AI brief rather
 *   than fetching and processing all zones unnecessarily.
 */
export function getVolunteerAvailability(zone, scenarioAdjustments = {}) {
  // #What — Filter to a single zone if specified, otherwise include all zones.
  //         Exact key match is used; partial zone ID matches are not supported.
  const entries = zone
    ? Object.entries(BASELINE_VOLUNTEERS).filter(([id]) => id === zone)
    : Object.entries(BASELINE_VOLUNTEERS);

  const zones = entries.map(([id, base]) => {
    // #What — Apply scenario adjustments if present; `??` preserves baseline
    //         when the adjustment field is explicitly undefined.
    const adj = scenarioAdjustments[id] || {};
    const available = adj.available ?? base.available;
    const total = adj.total ?? base.total;

    // #What — Guard against division by zero for hypothetical zero-total zones.
    const coverageRatio = total > 0 ? available / total : 1;

    // #What — Flag as shortage if coverage ratio is below the minimum threshold.
    // #Business-Intent — Shortage triggers a visual alert in the ops dashboard
    //   and is surfaced by the AI brief as a recommended action item.
    const shortage = coverageRatio < MIN_COVERAGE;

    return {
      zoneId: id,
      // #What — Convert internal hyphenated ID to a human-readable title-case label.
      zoneName: id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      available,
      total,
      // #What — Round to 2 decimal places for cleaner display (e.g. 0.83 not 0.8333...)
      coverageRatio: Math.round(coverageRatio * 100) / 100,
      shortage,
      // #What — 'below-threshold' status maps directly to an ops dashboard warning colour.
      status: shortage ? 'below-threshold' : 'adequate',
    };
  });

  // #What — Aggregate totals across all returned zones for the summary panel KPIs.
  const totalAvailable = zones.reduce((sum, z) => sum + z.available, 0);
  const totalRequired = zones.reduce((sum, z) => sum + z.total, 0);

  // #What — Any zone below threshold triggers the overall shortage flag;
  //         a single understaffed zone is still an ops concern.
  const anyShortage = zones.some((z) => z.shortage);

  return {
    zones,
    totalAvailable,
    totalRequired,
    shortage: anyShortage,
  };
}
