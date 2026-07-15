/**
 * @module tools/riskEngine
 * @description Deterministic risk-scoring engine for Unity Arena crowd management.
 *   Produces a weighted composite risk score (0–100) and categorises it into
 *   low / moderate / high / critical with an associated urgency directive.
 *   Six independent contributing factors — occupancy, queue duration, movement
 *   conflict, incident severity, accessibility obstruction, and transport
 *   disruption — are scored individually and combined using fixed weights.
 *
 *   Gemini may interpret or narrate the resulting score but MUST NEVER generate
 *   or modify the score itself. This module is the sole authoritative source.
 *
 * @pr-changes Initial implementation with six weighted factors and four risk
 *   categories. Added calculateOverallRisk() for venue-wide aggregation.
 *   WEIGHTS constants reviewed against crowd-safety literature; transportDisruption
 *   factor added at weight 0.05 to reflect secondary risk contribution.
 *   INCIDENT_SEVERITY_SCORES added to allow qualitative severity labels from
 *   the operations state to be mapped to numeric scores.
 *
 * @validation-review
 *   - WEIGHTS must sum to exactly 1.0; validated by design — any change must be
 *     audited to maintain the invariant (current sum = 0.30+0.20+0.15+0.20+0.10+0.05 = 1.0).
 *   - zoneId lookup is soft-fail: unknown zones return score 0 / category 'low'.
 *     Callers should verify zoneId against crowdState before calling.
 *   - Incident filter uses status !== 'resolved'; any new status value that is not
 *     'resolved' will be counted as active. New status values require review here.
 *   - Math.round is applied to final score; edge-case boundary values (e.g. 24.5)
 *     round up and may cross category thresholds unexpectedly.
 *
 * @scope-of-improvement
 *   - WEIGHTS should be configurable at runtime (e.g. via environment or admin UI)
 *     rather than hardcoded, allowing tuning without a code deploy.
 *   - calculateOverallRisk uses a simple arithmetic mean across zones; a
 *     weighted-by-occupancy average would produce more accurate venue-wide scores.
 *   - CATEGORIES upper boundary is 100 but the fallback also returns 'critical';
 *     the loop and fallback are redundant for score === 100.
 *   - Historical score tracking (trend analysis) would allow early-warning detection.
 *
 * @business-intent Provides venue operations with an objective, real-time risk
 *   indicator that drives response urgency decisions. A deterministic score
 *   prevents AI-generated risk assessments that could over- or under-state danger,
 *   which is critical in a crowd-safety context where delayed response can cause harm.
 */

/**
 * Risk category thresholds mapping numeric score ranges to labels and urgency directives.
 * Categories are evaluated in ascending order of the `max` boundary.
 * @type {Array<{max: number, label: string, urgency: string}>}
 * @business-intent Urgency strings are designed to directly inform staff response
 *   protocols — 'respond-immediately' maps to the venue's Level 4 alert procedure.
 */
const CATEGORIES = [
  { max: 24, label: 'low', urgency: 'routine' },
  { max: 49, label: 'moderate', urgency: 'monitor' },
  { max: 74, label: 'high', urgency: 'respond-within-15-minutes' },
  { max: 100, label: 'critical', urgency: 'respond-immediately' },
];

/**
 * Factor weights for the composite risk score.
 * All weights must sum to 1.0 — this invariant is load-bearing for score accuracy.
 * @type {Record<string, number>}
 * @risk-area Changing any weight without re-validating the sum to 1.0 will silently
 *   produce incorrect scores, potentially under- or over-alerting operations staff.
 * @business-intent Each weight reflects the relative danger contribution of that
 *   factor based on crowd-safety domain knowledge: occupancy and incident severity
 *   are the primary drivers, queue duration and movement conflict are secondary.
 */
const WEIGHTS = {
  occupancy: 0.30,            // #What — 30% weight: primary density signal
  queueDuration: 0.20,        // #What — 20% weight: prolonged queuing increases frustration and surge risk
  movementConflict: 0.15,     // #What — 15% weight: opposing flows are a major crush precursor
  incidentSeverity: 0.20,     // #What — 20% weight: active incidents dominate urgency
  accessibilityObstruction: 0.10, // #What — 10% weight: blocked accessible routes create secondary hazards
  transportDisruption: 0.05,  // #What — 5% weight: transport issues add moderate indirect pressure
};

/**
 * Maps qualitative incident severity labels to numeric score equivalents.
 * Scores are spaced to produce proportional risk contributions.
 * @type {Record<string, number>}
 */
const INCIDENT_SEVERITY_SCORES = {
  low: 25,
  moderate: 50,
  high: 75,
  critical: 100,
};

/**
 * Map an occupancy percentage (0–100) to a normalised 0–100 score.
 *
 * @description Clamps the raw occupancy percentage to the valid [0, 100] range.
 *   A zone at 120% of rated capacity returns 100, not 120.
 *
 * @param {number} pct - Raw occupancy percentage (may exceed 100 in overflow scenarios).
 * @returns {number} Clamped score in [0, 100].
 *
 * @validation-note Clamping at 100 means overcapacity zones are indistinguishable
 *   from exactly-full zones in this factor. Future versions could use a log scale
 *   to penalise overcapacity more severely.
 */
function occupancyScore(pct) {
  // #What — clamp to valid range; overcapacity reports as max score
  return Math.min(100, Math.max(0, pct));
}

/**
 * Map queue duration in minutes to a 0–100 score, capped at 30 minutes.
 *
 * @description Uses a linear scale where 30 minutes = 100 (maximum score).
 *   Queue times beyond 30 minutes are capped to avoid distorting the composite.
 *
 * @param {number} minutes - Current queue wait time in minutes.
 * @returns {number} Score in [0, 100].
 *
 * @validation-note The 30-minute cap is an operational heuristic, not a physical limit.
 *   In extreme scenarios queue times may far exceed 30 minutes; consider raising the cap.
 */
function queueScore(minutes) {
  // #What — linear mapping: 30 minutes → score of 100
  return Math.min(100, (minutes / 30) * 100);
}

/**
 * Return the highest incident severity score for all active incidents in a zone.
 *
 * @description Filters the incidents list to only those matching the zoneId and
 *   with status !== 'resolved', then returns the highest INCIDENT_SEVERITY_SCORES
 *   value found. Returns 0 if no active incidents exist for the zone.
 *
 * @param {string} zoneId - Zone to query.
 * @param {Array<Object>} incidents - Full incidents list from crowdState.
 * @returns {number} Highest incident severity score in [0, 100], or 0 if none.
 *
 * @validation-note Any incident.severity value not in INCIDENT_SEVERITY_SCORES
 *   maps to 0 via the `|| 0` fallback — unknown severities are effectively ignored.
 *   This should be validated upstream at incident ingestion time.
 *
 * @business-intent Uses the maximum rather than average so a single critical incident
 *   in a zone brings the zone's incident factor to 100, reflecting real urgency.
 */
function zoneIncidentScore(zoneId, incidents) {
  // #What — only count active (non-resolved) incidents in this zone
  const zoneIncidents = incidents.filter((i) => i.zone === zoneId && i.status !== 'resolved');
  if (zoneIncidents.length === 0) return 0;
  // #What — take the highest severity score across all active zone incidents
  return Math.max(...zoneIncidents.map((i) => INCIDENT_SEVERITY_SCORES[i.severity] || 0));
}

/**
 * Categorise a numeric risk score into a labelled category and urgency directive.
 *
 * @description Iterates CATEGORIES in ascending order and returns the first
 *   category whose max boundary is >= the score. The hardcoded fallback ensures
 *   scores of exactly 100 are always classified as 'critical'.
 *
 * @param {number} score - Composite risk score in [0, 100].
 * @returns {{ label: string, urgency: string }} Category and urgency strings.
 *
 * @business-intent Urgency strings must remain stable across deployments — they
 *   are referenced in the operations UI, PA system integrations, and escalation
 *   runbooks. Any change requires cross-team sign-off.
 */
function categorise(score) {
  for (const cat of CATEGORIES) {
    // #What — return the first category whose max ceiling covers this score
    if (score <= cat.max) return { label: cat.label, urgency: cat.urgency };
  }
  // #What — safety fallback; should never be reached given CATEGORIES covers 0–100
  return { label: 'critical', urgency: 'respond-immediately' };
}

/**
 * Calculate the composite risk score for a specific venue zone.
 *
 * @description Retrieves the zone record from crowdState, computes each of the six
 *   weighted factor scores, sums them into a composite score, and returns a
 *   detailed RiskResult including per-factor breakdowns, category, urgency, and
 *   the snapshot version the score was derived from.
 *
 * @param {string} zoneId - ID of the zone to score.
 * @param {{ zones: Array<Object>, incidents: Array<Object> }} crowdState - Live crowd snapshot.
 * @param {Array<Object>} [transportState] - Current transport status array.
 * @returns {import('../types.js').RiskResult} Full risk result with factor breakdown.
 *
 * @risk-area The returned score directly drives urgency decisions in the Ops
 *   Command Centre. Incorrect inputs (stale snapshots, missing zones) can
 *   produce artificially low scores, masking real danger.
 *
 * @business-intent Zone-level risk scores allow operations staff to triage
 *   their response — focusing resources on the highest-risk zone first.
 */
export function calculateZoneRisk(zoneId, crowdState, transportState = []) {
  // #What — find the zone in the crowd state; return a safe zero-risk result if not found
  const zone = crowdState.zones.find((z) => z.id === zoneId);

  // #Uncertain — returning score 0 for unknown zones may mask real risk if the zoneId
  //   is simply misspelled or not yet in the snapshot; consider throwing instead
  if (!zone) {
    return {
      zoneId,
      score: 0,
      category: 'low',
      factors: [],
      recommendedReviewUrgency: 'routine',
      snapshotVersion: 'unknown',
      calculatedAt: new Date().toISOString(),
    };
  }

  // #What — check if any transport route is currently disrupted (binary signal)
  const hasTransportDisruption = transportState.some((t) => t.status === 'disrupted');

  // #What — compute raw 0–100 value for each of the six risk factors
  const factorValues = {
    occupancy: occupancyScore(zone.occupancyPct),
    queueDuration: queueScore(zone.queueMinutes),
    movementConflict: zone.movementDirection === 'conflicted' ? 100 : 0, // #Business-Intent — conflicted flow = maximum score for this factor
    incidentSeverity: zoneIncidentScore(zoneId, crowdState.incidents),
    accessibilityObstruction: zone.accessibilityObstruction ? 100 : 0, // #Business-Intent — any obstruction immediately maxes the accessibility factor
    transportDisruption: hasTransportDisruption ? 100 : 0, // #What — binary: any disruption = 100 for this minor-weight factor
  };

  // #What — build the factor breakdown array for the result (includes weight and contribution)
  const factors = Object.entries(factorValues).map(([factor, value]) => ({
    factor,
    weight: WEIGHTS[factor],
    contribution: Math.round(value * WEIGHTS[factor]),
    value,
  }));

  // #What — weighted sum of all factor values produces the composite score
  const score = Math.round(
    Object.entries(factorValues).reduce((sum, [factor, value]) => sum + value * WEIGHTS[factor], 0),
  );

  const { label, urgency } = categorise(score);

  return {
    zoneId,
    zoneName: zone.name,
    score,
    category: label,
    factors,
    recommendedReviewUrgency: urgency,
    // #What — pass through the snapshot version so consumers can detect stale calculations
    snapshotVersion: zone.snapshotVersion || 'unknown',
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate an aggregated venue-wide risk score from all zone risk scores.
 *
 * @description Scores every zone individually using calculateZoneRisk(), then
 *   computes the arithmetic mean across all zones as the overall score.
 *   Also identifies and returns the single highest-risk zone for prioritised display.
 *
 * @param {{ zones: Array<Object>, incidents: Array<Object> }} crowdState - Live crowd snapshot.
 * @param {Array<Object>} transportState - Current transport status array.
 * @returns {{ score: number, category: string, zoneRisks: Array<Object>, highestRiskZone: Object|null, calculatedAt: string }}
 *   Aggregated risk summary with per-zone breakdown.
 *
 * @risk-area Arithmetic mean can be misleading when one zone is critical and others
 *   are low — the overall score may appear moderate even though immediate action is
 *   required. Operations staff should always review highestRiskZone alongside score.
 *
 * @business-intent Provides a single headline risk indicator for the Ops dashboard
 *   summary panel, enabling rapid situational awareness for the operations manager.
 */
export function calculateOverallRisk(crowdState, transportState) {
  // #What — score every zone individually, then aggregate
  const zoneRisks = crowdState.zones.map((zone) =>
    calculateZoneRisk(zone.id, crowdState, transportState),
  );

  // #What — arithmetic mean of all zone scores; Math.max(1, ...) guards against empty array divide-by-zero
  const score = Math.round(
    zoneRisks.reduce((sum, zr) => sum + zr.score, 0) / Math.max(1, zoneRisks.length),
  );

  const { label } = categorise(score);

  // #What — find the single zone with the highest score for priority display
  const highestRiskZone = zoneRisks.reduce(
    (max, zr) => (zr.score > (max?.score ?? -1) ? zr : max),
    null,
  );

  return {
    score,
    category: label,
    zoneRisks,
    highestRiskZone,
    calculatedAt: new Date().toISOString(),
  };
}
