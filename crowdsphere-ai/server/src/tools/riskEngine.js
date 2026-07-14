/**
 * Deterministic risk scoring engine for Unity Arena.
 * Produces a 0–100 risk score with contributing factor breakdown.
 *
 * Gemini may interpret this score but must never generate it.
 *
 * @module tools/riskEngine
 */

/** Risk category thresholds */
const CATEGORIES = [
  { max: 24, label: 'low', urgency: 'routine' },
  { max: 49, label: 'moderate', urgency: 'monitor' },
  { max: 74, label: 'high', urgency: 'respond-within-15-minutes' },
  { max: 100, label: 'critical', urgency: 'respond-immediately' },
];

/** Factor weights — must sum to 1.0 */
const WEIGHTS = {
  occupancy: 0.30,
  queueDuration: 0.20,
  movementConflict: 0.15,
  incidentSeverity: 0.20,
  accessibilityObstruction: 0.10,
  transportDisruption: 0.05,
};

const INCIDENT_SEVERITY_SCORES = {
  low: 25,
  moderate: 50,
  high: 75,
  critical: 100,
};

/**
 * Map an occupancy percentage to a 0–100 score.
 * @param {number} pct
 * @returns {number}
 */
function occupancyScore(pct) {
  return Math.min(100, Math.max(0, pct));
}

/**
 * Map queue minutes to a 0–100 score (capped at 30 minutes).
 * @param {number} minutes
 * @returns {number}
 */
function queueScore(minutes) {
  return Math.min(100, (minutes / 30) * 100);
}

/**
 * Get the highest incident severity score for a zone.
 * @param {string} zoneId
 * @param {Array<Object>} incidents
 * @returns {number}
 */
function zoneIncidentScore(zoneId, incidents) {
  const zoneIncidents = incidents.filter((i) => i.zone === zoneId && i.status !== 'resolved');
  if (zoneIncidents.length === 0) return 0;
  return Math.max(...zoneIncidents.map((i) => INCIDENT_SEVERITY_SCORES[i.severity] || 0));
}

/**
 * Categorise a numeric score.
 * @param {number} score
 * @returns {{ label: string, urgency: string }}
 */
function categorise(score) {
  for (const cat of CATEGORIES) {
    if (score <= cat.max) return { label: cat.label, urgency: cat.urgency };
  }
  return { label: 'critical', urgency: 'respond-immediately' };
}

/**
 * Calculate risk score for a specific zone.
 *
 * @param {string} zoneId
 * @param {{ zones: Array<Object>, incidents: Array<Object> }} crowdState
 * @param {Array<Object>} [transportState]
 * @returns {import('../types.js').RiskResult}
 */
export function calculateZoneRisk(zoneId, crowdState, transportState = []) {
  const zone = crowdState.zones.find((z) => z.id === zoneId);

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

  const hasTransportDisruption = transportState.some((t) => t.status === 'disrupted');

  const factorValues = {
    occupancy: occupancyScore(zone.occupancyPct),
    queueDuration: queueScore(zone.queueMinutes),
    movementConflict: zone.movementDirection === 'conflicted' ? 100 : 0,
    incidentSeverity: zoneIncidentScore(zoneId, crowdState.incidents),
    accessibilityObstruction: zone.accessibilityObstruction ? 100 : 0,
    transportDisruption: hasTransportDisruption ? 100 : 0,
  };

  const factors = Object.entries(factorValues).map(([factor, value]) => ({
    factor,
    weight: WEIGHTS[factor],
    contribution: Math.round(value * WEIGHTS[factor]),
    value,
  }));

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
    snapshotVersion: zone.snapshotVersion || 'unknown',
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * Calculate overall venue risk from all zones.
 *
 * @param {{ zones: Array<Object>, incidents: Array<Object> }} crowdState
 * @param {Array<Object>} transportState
 * @returns {{ score: number, category: string, zoneRisks: Array<Object>, highestRiskZone: Object|null, calculatedAt: string }}
 */
export function calculateOverallRisk(crowdState, transportState) {
  const zoneRisks = crowdState.zones.map((zone) =>
    calculateZoneRisk(zone.id, crowdState, transportState),
  );

  const score = Math.round(
    zoneRisks.reduce((sum, zr) => sum + zr.score, 0) / Math.max(1, zoneRisks.length),
  );

  const { label } = categorise(score);
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
