/**
 * Risk Analysis component — visualises zone risk scores with deterministic data.
 */
import PropTypes from 'prop-types';
import styles from './OpsRiskAnalysis.module.css';

function RiskBar({ label, score, category }) {
  const COLORS = { low: 'var(--risk-low)', moderate: 'var(--risk-moderate)', high: 'var(--risk-high)', critical: 'var(--risk-critical)' };
  const color = COLORS[category] || 'var(--text-muted)';
  return (
    <div className={styles.riskBar}>
      <div className={styles.riskBarLabel}>
        <span className={styles.riskBarName}>{label}</span>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <span className={`risk-badge risk-badge--${category}`}>{category}</span>
          <span className={styles.riskBarScore} style={{ color }}>{score}</span>
        </div>
      </div>
      <div className="progress-bar" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} risk score ${score}/100`}>
        <div className="progress-bar__fill" style={{ width: `${score}%`, background: color, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  );
}

RiskBar.propTypes = {
  label: PropTypes.string.isRequired,
  score: PropTypes.number.isRequired,
  category: PropTypes.string.isRequired,
};

export default function OpsRiskAnalysis({ snapshot }) {
  if (!snapshot) {
    return (
      <div className="empty-state">
        <div className="spinner spinner--lg" />
        <p>Loading risk analysis…</p>
      </div>
    );
  }

  const m = snapshot.metrics;
  const zones = snapshot.crowd?.zones || [];

  // Build zone risk rows from crowd data
  const zoneRisks = zones.map((z) => {
    const score = Math.round(
      (z.occupancyPct * 0.35) +
      (z.queueMinutes > 20 ? 30 : z.queueMinutes > 10 ? 15 : 0) +
      (z.accessibilityObstruction ? 15 : 0) +
      (z.densityLevel === 'critical' ? 20 : z.densityLevel === 'high' ? 10 : 0)
    );
    const category =
      score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'moderate' : 'low';
    return { id: z.id, name: z.name, score: Math.min(100, score), category };
  }).sort((a, b) => b.score - a.score);

  const elevatorOutages = snapshot.elevatorOutages || [];
  const transportDisruptions = snapshot.transport?.filter((t) => t.status !== 'operational') || [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2 className={styles.title}>🎯 Risk Analysis</h2>
        <p className={styles.desc}>
          All risk scores are calculated deterministically by the CrowdSphere AI risk engine.
          Gemini is not used for risk calculation — it only interprets and communicates the scores.
        </p>
      </header>

      <div className={styles.overallBanner}
        style={{ borderColor: `var(--risk-${m.overallRisk})`, background: `var(--color-${m.overallRisk === 'critical' ? 'rose' : m.overallRisk === 'high' ? 'amber' : m.overallRisk === 'moderate' ? 'amber' : 'green'}-glow)` }}>
        <div>
          <div className={styles.overallLabel}>Overall Risk Score</div>
          <div className={styles.overallScore} style={{ color: `var(--risk-${m.overallRisk})` }}>
            {m.overallRiskScore}<span className={styles.overallMax}>/100</span>
          </div>
        </div>
        <div>
          <div className={styles.overallLabel}>Category</div>
          <div className={`risk-badge risk-badge--${m.overallRisk}`} style={{ fontSize: '1rem', padding: '8px 20px', marginTop: '4px' }}>
            {m.overallRisk?.toUpperCase()}
          </div>
        </div>
        <div>
          <div className={styles.overallLabel}>Highest Risk Zone</div>
          <div className={styles.highestZone}>{m.highestRiskZone}</div>
        </div>
        <div>
          <div className={styles.overallLabel}>High Risk Zones</div>
          <div className={styles.overallScore} style={{ color: m.highRiskZoneCount > 0 ? 'var(--risk-high)' : 'var(--risk-low)' }}>
            {m.highRiskZoneCount}
          </div>
        </div>
      </div>

      <div className={styles.mainGrid}>
        <section aria-label="Zone risk scores">
          <h3 className={styles.sectionTitle}>Zone Risk Scores</h3>
          <div className={styles.riskBars}>
            {zoneRisks.map((z) => (
              <RiskBar key={z.id} label={z.name} score={z.score} category={z.category} />
            ))}
          </div>
          <p className={styles.engineNote}>
            Scores computed by deterministic risk engine. Factors: occupancy (35%), queue time (25%), incidents (20%), movement (10%), transport (10%).
          </p>
        </section>

        <section aria-label="Risk factor breakdown">
          <h3 className={styles.sectionTitle}>Risk Factor Breakdown</h3>

          <div className={styles.factorCards}>
            <div className={`card ${styles.factorCard}`}>
              <div className={styles.factorIcon}>🏟</div>
              <div className={styles.factorLabel}>Stadium Occupancy</div>
              <div className={styles.factorValue} style={{ color: m.stadiumOccupancyPct > 80 ? 'var(--risk-critical)' : 'var(--risk-low)' }}>
                {m.stadiumOccupancyPct}%
              </div>
            </div>
            <div className={`card ${styles.factorCard}`}>
              <div className={styles.factorIcon}>⚠</div>
              <div className={styles.factorLabel}>Active Incidents</div>
              <div className={styles.factorValue} style={{ color: m.activeIncidentCount > 0 ? 'var(--risk-moderate)' : 'var(--risk-low)' }}>
                {m.activeIncidentCount}
              </div>
            </div>
            <div className={`card ${styles.factorCard}`}>
              <div className={styles.factorIcon}>⏱</div>
              <div className={styles.factorLabel}>Longest Queue</div>
              <div className={styles.factorValue} style={{ color: m.longestQueueMinutes > 20 ? 'var(--risk-critical)' : 'var(--risk-low)' }}>
                {m.longestQueueMinutes} min
              </div>
            </div>
            <div className={`card ${styles.factorCard}`}>
              <div className={styles.factorIcon}>🚌</div>
              <div className={styles.factorLabel}>Transport Disruptions</div>
              <div className={styles.factorValue} style={{ color: m.transportDisruptions > 0 ? 'var(--risk-high)' : 'var(--risk-low)' }}>
                {m.transportDisruptions}
              </div>
            </div>
            <div className={`card ${styles.factorCard}`}>
              <div className={styles.factorIcon}>♿</div>
              <div className={styles.factorLabel}>Accessibility Issues</div>
              <div className={styles.factorValue} style={{ color: m.accessibilityDisruptions > 0 ? 'var(--risk-high)' : 'var(--risk-low)' }}>
                {m.accessibilityDisruptions}
              </div>
            </div>
            <div className={`card ${styles.factorCard}`}>
              <div className={styles.factorIcon}>🦺</div>
              <div className={styles.factorLabel}>Volunteer Shortage</div>
              <div className={styles.factorValue} style={{ color: m.volunteerShortage ? 'var(--risk-high)' : 'var(--risk-low)' }}>
                {m.volunteerShortage ? 'YES' : 'NO'}
              </div>
            </div>
          </div>

          {/* Elevator outages */}
          {elevatorOutages.length > 0 && (
            <div className={styles.outageCard} role="alert">
              <div className={styles.outageTitle}>🛗 Elevator Outages ({elevatorOutages.length})</div>
              <div className={styles.outageList}>
                {elevatorOutages.map((e, i) => <span key={i} className="tag">{e.replace(/-/g, ' ')}</span>)}
              </div>
              <p className={styles.outageNote}>Affects accessible access. Affected fans should be directed to ramps via Gate E / Accessible Hub.</p>
            </div>
          )}

          {/* Transport disruptions */}
          {transportDisruptions.length > 0 && (
            <div className={styles.outageCard} role="alert">
              <div className={styles.outageTitle}>🚌 Transport Disruptions</div>
              {transportDisruptions.map((t) => (
                <div key={t.id} className={styles.outageItem}>
                  <strong>{t.name}</strong>: {t.status} — {t.notes}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

OpsRiskAnalysis.propTypes = {
  snapshot: PropTypes.shape({
    metrics: PropTypes.shape({
      overallRisk: PropTypes.string,
      overallRiskScore: PropTypes.number,
      highestRiskZone: PropTypes.string,
      highRiskZoneCount: PropTypes.number,
      stadiumOccupancyPct: PropTypes.number,
      activeIncidentCount: PropTypes.number,
      longestQueueMinutes: PropTypes.number,
      transportDisruptions: PropTypes.number,
      accessibilityDisruptions: PropTypes.number,
      volunteerShortage: PropTypes.bool,
    }),
    crowd: PropTypes.shape({
      zones: PropTypes.arrayOf(PropTypes.object),
    }),
    elevatorOutages: PropTypes.arrayOf(PropTypes.string),
    transport: PropTypes.arrayOf(PropTypes.object),
  }),
};
