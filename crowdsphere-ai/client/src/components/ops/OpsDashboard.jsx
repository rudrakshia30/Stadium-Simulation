/**
 * Operations Dashboard — real-time venue metrics, zone cards, and incident list.
 */
import PropTypes from 'prop-types';
import styles from './OpsDashboard.module.css';

const DENSITY_COLOR = {
  low:      'var(--risk-low)',
  moderate: 'var(--risk-moderate)',
  high:     'var(--risk-high)',
  critical: 'var(--risk-critical)',
  unknown:  'var(--text-muted)',
};

function MetricCard({ icon, label, value, sub, color, alert }) {
  return (
    <div className={`card ${styles.metricCard} ${alert ? styles.metricCardAlert : ''}`}
      style={alert ? { borderColor: color } : {}}>
      <div className={styles.metricIcon} style={{ background: `${color}22`, border: `1px solid ${color}44` }}>
        <span aria-hidden="true">{icon}</span>
      </div>
      <div className={styles.metricContent}>
        <div className={styles.metricValue} style={{ color }}>{value}</div>
        <div className={styles.metricLabel}>{label}</div>
        {sub && <div className={styles.metricSub}>{sub}</div>}
      </div>
    </div>
  );
}

MetricCard.propTypes = {
  icon: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  sub: PropTypes.string,
  color: PropTypes.string,
  alert: PropTypes.bool,
};

function ZoneCard({ zone }) {
  const pct = zone.occupancyPct;
  const color = DENSITY_COLOR[zone.densityLevel] || 'var(--text-muted)';

  return (
    <div className={`card ${styles.zoneCard}`}>
      <div className={styles.zoneHeader}>
        <div className={styles.zoneName}>{zone.name}</div>
        <span className={`risk-badge risk-badge--${zone.densityLevel}`}>{zone.densityLevel}</span>
      </div>

      <div className={styles.zoneMetrics}>
        <div className={styles.zoneStat}>
          <span className={styles.zoneStatVal}>{pct}%</span>
          <span className={styles.zoneStatLabel}>occupancy</span>
        </div>
        <div className={styles.zoneStat}>
          <span className={styles.zoneStatVal}>{zone.queueMinutes}</span>
          <span className={styles.zoneStatLabel}>min queue</span>
        </div>
      </div>

      <div className="progress-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${zone.name} occupancy ${pct}%`}>
        <div className="progress-bar__fill" style={{ width: `${pct}%`, background: color }} />
      </div>

      {zone.accessibilityObstruction && (
        <div className={styles.zoneObstruction} role="alert">
          ♿ Accessibility obstruction reported
        </div>
      )}
    </div>
  );
}

ZoneCard.propTypes = {
  zone: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    occupancyPct: PropTypes.number,
    densityLevel: PropTypes.string,
    queueMinutes: PropTypes.number,
    accessibilityObstruction: PropTypes.bool,
  }).isRequired,
};

function IncidentCard({ incident }) {
  const severityColor = {
    low: 'var(--risk-low)', moderate: 'var(--risk-moderate)',
    high: 'var(--risk-high)', critical: 'var(--risk-critical)',
  };

  return (
    <div className={`card ${styles.incidentCard}`}
      style={{ borderLeft: `3px solid ${severityColor[incident.severity]}` }}>
      <div className={styles.incidentHeader}>
        <div className={styles.incidentType}>{incident.type.replace(/-/g, ' ')}</div>
        <span className={`risk-badge risk-badge--${incident.severity}`}>{incident.severity}</span>
      </div>
      <div className={styles.incidentZone}>📍 {incident.zone.replace(/-/g, ' ')}</div>
      <p className={styles.incidentDesc}>{incident.description}</p>
      <div className={styles.incidentFooter}>
        <span className="tag">Role: {incident.requiredRole}</span>
        <span className="tag">{incident.humanVerified ? '✓ Verified' : '? Unverified'}</span>
      </div>
    </div>
  );
}

IncidentCard.propTypes = {
  incident: PropTypes.shape({
    id: PropTypes.string,
    type: PropTypes.string,
    severity: PropTypes.string,
    zone: PropTypes.string,
    description: PropTypes.string,
    requiredRole: PropTypes.string,
    humanVerified: PropTypes.bool,
    status: PropTypes.string,
  }).isRequired,
};

function TransportCard({ transport }) {
  const isDisrupted = transport.status !== 'operational';
  return (
    <div className={`card ${styles.transportCard} ${isDisrupted ? styles.transportDisrupted : ''}`}>
      <div className={styles.transportHeader}>
        <div className={styles.transportName}>{transport.name}</div>
        <div className={styles.transportStatus} style={{ color: isDisrupted ? 'var(--risk-critical)' : 'var(--risk-low)' }}>
          <span className={`status-dot ${isDisrupted ? 'status-dot--red' : 'status-dot--green'}`} />
          {transport.status}
        </div>
      </div>
      {transport.nextDeparture && (
        <div className={styles.transportMeta}>
          🕐 Next: {new Date(transport.nextDeparture).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {transport.frequency && ` · Every ${transport.frequency} min`}
        </div>
      )}
      {transport.notes && <p className={styles.transportNotes}>{transport.notes}</p>}
    </div>
  );
}

TransportCard.propTypes = {
  transport: PropTypes.shape({
    id: PropTypes.string,
    name: PropTypes.string,
    status: PropTypes.string,
    nextDeparture: PropTypes.string,
    frequency: PropTypes.number,
    notes: PropTypes.string,
  }).isRequired,
};

export default function OpsDashboard({ snapshot, loading }) {
  if (loading && !snapshot) {
    return (
      <div className="empty-state">
        <div className="spinner spinner--lg" aria-label="Loading dashboard" />
        <p>Loading operations snapshot…</p>
      </div>
    );
  }

  if (!snapshot) return null;

  const m = snapshot.metrics;
  const activeIncidents = snapshot.crowd?.incidents?.filter((i) => i.status !== 'resolved') || [];
  const criticalIncidents = activeIncidents.filter((i) => i.severity === 'critical');

  return (
    <div className={styles.dashboard}>
      {criticalIncidents.length > 0 && (
        <div className={styles.criticalBanner} role="alert" aria-live="assertive">
          <span>🚨</span>
          <strong>{criticalIncidents.length} CRITICAL INCIDENT{criticalIncidents.length > 1 ? 'S' : ''} ACTIVE</strong>
          <span>— Immediate response required. All recommendations require human approval.</span>
        </div>
      )}

      {/* Key metrics */}
      <section className={styles.section} aria-label="Key metrics">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>📊 Key Metrics</h2>
          <span className={styles.sectionNote}>Simulated data · Updates every 30s</span>
        </div>
        <div className={`${styles.metricsGrid} stagger`}>
          <MetricCard icon="👥" label="Stadium Occupancy" value={`${m.stadiumOccupancyPct}%`}
            color={m.stadiumOccupancyPct > 80 ? 'var(--risk-critical)' : m.stadiumOccupancyPct > 60 ? 'var(--risk-high)' : 'var(--risk-low)'}
            alert={m.stadiumOccupancyPct > 80} />
          <MetricCard icon="🎯" label="Overall Risk" value={m.overallRisk?.toUpperCase()}
            sub={`Score: ${m.overallRiskScore}/100`}
            color={DENSITY_COLOR[m.overallRisk] || 'var(--text-muted)'}
            alert={m.overallRisk === 'critical' || m.overallRisk === 'high'} />
          <MetricCard icon="⚠" label="Active Incidents" value={m.activeIncidentCount}
            sub={criticalIncidents.length > 0 ? `${criticalIncidents.length} critical` : 'All non-critical'}
            color={m.activeIncidentCount > 0 ? 'var(--risk-moderate)' : 'var(--risk-low)'}
            alert={m.activeIncidentCount > 2} />
          <MetricCard icon="⏱" label="Longest Queue" value={`${m.longestQueueMinutes} min`}
            color={m.longestQueueMinutes > 20 ? 'var(--risk-critical)' : m.longestQueueMinutes > 10 ? 'var(--risk-high)' : 'var(--risk-low)'}
            alert={m.longestQueueMinutes > 20} />
          <MetricCard icon="🦺" label="Volunteers" value={m.availableVolunteers}
            sub={m.volunteerShortage ? '⚠ Shortage detected' : 'Coverage adequate'}
            color={m.volunteerShortage ? 'var(--risk-high)' : 'var(--risk-low)'}
            alert={m.volunteerShortage} />
          <MetricCard icon="♿" label="Access Disruptions" value={m.accessibilityDisruptions}
            sub={m.elevatorOutages?.length > 0 ? `Elevators: ${m.elevatorOutages?.length} offline` : 'All elevators operational'}
            color={m.accessibilityDisruptions > 0 ? 'var(--risk-high)' : 'var(--risk-low)'}
            alert={m.accessibilityDisruptions > 0} />
        </div>
      </section>

      <div className={styles.mainGrid}>
        {/* Zone status */}
        <section className={styles.zonesSection} aria-label="Zone status">
          <h2 className={styles.sectionTitle}>🗺 Zone Status</h2>
          <div className={styles.zonesGrid}>
            {snapshot.crowd?.zones?.map((z) => <ZoneCard key={z.id} zone={z} />)}
          </div>
        </section>

        {/* Right column */}
        <div className={styles.rightCol}>
          {/* Active incidents */}
          <section aria-label="Active incidents">
            <h2 className={styles.sectionTitle}>🚨 Active Incidents ({activeIncidents.length})</h2>
            <div className={styles.incidentList}>
              {activeIncidents.length === 0 ? (
                <div className={styles.noIncidents}>✓ No active incidents</div>
              ) : (
                activeIncidents.map((i) => <IncidentCard key={i.id} incident={i} />)
              )}
            </div>
          </section>

          {/* Transport */}
          <section aria-label="Transport status" style={{ marginTop: 'var(--space-5)' }}>
            <h2 className={styles.sectionTitle}>🚌 Transport Status</h2>
            <div className={styles.transportList}>
              {snapshot.transport?.map((t) => <TransportCard key={t.id} transport={t} />)}
            </div>
          </section>
        </div>
      </div>

      <div className="disclaimer">
        All data is simulated. This is a demonstration prototype. All recommendations require human approval before implementation.
      </div>
    </div>
  );
}

OpsDashboard.propTypes = {
  snapshot: PropTypes.shape({
    metrics: PropTypes.shape({
      stadiumOccupancyPct: PropTypes.number,
      overallRisk: PropTypes.string,
      overallRiskScore: PropTypes.number,
      activeIncidentCount: PropTypes.number,
      longestQueueMinutes: PropTypes.number,
      availableVolunteers: PropTypes.number,
      volunteerShortage: PropTypes.bool,
      accessibilityDisruptions: PropTypes.number,
      elevatorOutages: PropTypes.arrayOf(PropTypes.string),
    }),
    crowd: PropTypes.shape({
      zones: PropTypes.arrayOf(PropTypes.object),
      incidents: PropTypes.arrayOf(PropTypes.object),
    }),
    transport: PropTypes.arrayOf(PropTypes.object),
  }),
  loading: PropTypes.bool,
};
