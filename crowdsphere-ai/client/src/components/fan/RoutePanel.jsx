/**
 * Route Finder panel — deterministic route calculation with step-by-step directions.
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client.js';
import styles from './RoutePanel.module.css';

const ROUTE_TYPE_ICONS = {
  stairs: '🪜', elevator: '🛗', ramp: '⬆️', concourse: '🚶', accessible: '♿',
  external: '🚪', plaza: '🏟️',
};

const POPULAR_ROUTES = [
  { from: 'gate-a', to: 'section-102', label: 'Gate A → Section 102' },
  { from: 'gate-e', to: 'section-214', label: 'Accessible Gate E → Section 214' },
  { from: 'gate-b', to: 'metro-main', label: 'Gate B → Metro Station' },
  { from: 'gate-c', to: 'bus-terminal', label: 'Gate C → Bus Terminal' },
  { from: 'zone-north-concourse', to: 'section-301', label: 'North Concourse → Upper Stand' },
];

export default function RoutePanel({ initialRoute, preferences, venueData }) {
  const [from, setFrom] = useState(initialRoute?.from || '');
  const [to, setTo] = useState(initialRoute?.to || '');
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialRoute?.from) setFrom(initialRoute.from);
    if (initialRoute?.to) setTo(initialRoute.to);
  }, [initialRoute]);

  useEffect(() => {
    if (initialRoute?.from && initialRoute?.to) {
      calculateRoute(initialRoute.from, initialRoute.to);
    }
  }, [initialRoute]);

  const calculateRoute = useCallback(async (fromNode, toNode) => {
    if (!fromNode || !toNode) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.route({
        from: fromNode,
        to: toNode,
        preferences,
      });
      setRoute(result);
    } catch (err) {
      setError(err.message);
      setRoute(null);
    } finally {
      setLoading(false);
    }
  }, [preferences]);

  const handleSubmit = (e) => {
    e.preventDefault();
    calculateRoute(from, to);
  };

  const nodes = venueData?.nodes || [];

  const accessStatusColor = route?.accessibilityStatus === 'fully-accessible'
    ? 'var(--risk-low)'
    : route?.accessibilityStatus === 'partially-accessible'
    ? 'var(--risk-moderate)'
    : 'var(--risk-critical)';

  return (
    <div className={styles.routePanel}>
      <div className={styles.sidebar}>
        <h2 className={styles.sidebarTitle}>Route Finder</h2>
        <p className={styles.sidebarDesc}>
          Get step-by-step directions between any two points in Unity Arena.
          Routes are calculated deterministically — not by AI.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="route-from" className="form-label">From</label>
            <select
              id="route-from"
              className="form-select"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            >
              <option value="">Select start…</option>
              {nodes.map((n) => (
                <option key={n} value={n}>{n.replace(/-/g, ' ')}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className={`btn btn-ghost btn-sm ${styles.swapBtn}`}
            onClick={() => { const tmp = from; setFrom(to); setTo(tmp); }}
            aria-label="Swap start and destination"
            title="Swap start and destination"
          >
            ⇅ Swap
          </button>

          <div className="form-group">
            <label htmlFor="route-to" className="form-label">To</label>
            <select
              id="route-to"
              className="form-select"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            >
              <option value="">Select destination…</option>
              {nodes.map((n) => (
                <option key={n} value={n}>{n.replace(/-/g, ' ')}</option>
              ))}
            </select>
          </div>

          {(preferences?.wheelchair || preferences?.stepFree) && (
            <div className={styles.prefNote}>
              ♿ Accessibility preferences active — route will be step-free
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!from || !to || loading}
            aria-busy={loading}
          >
            {loading ? <><span className="spinner spinner--sm" aria-hidden="true" /> Calculating…</> : '🧭 Find Route'}
          </button>
        </form>

        <div className={styles.popularRoutes}>
          <div className={styles.sectionTitle}>Popular routes</div>
          {POPULAR_ROUTES.map((r) => (
            <button
              key={r.label}
              className={styles.popularRoute}
              onClick={() => { setFrom(r.from); setTo(r.to); calculateRoute(r.from, r.to); }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.main} aria-live="polite">
        {loading && (
          <div className="empty-state">
            <div className="spinner spinner--lg" aria-label="Calculating route" />
            <p>Calculating route…</p>
          </div>
        )}

        {error && !loading && (
          <div className={styles.errorCard} role="alert">
            <div className={styles.errorIcon}>⚠</div>
            <div>
              <strong>Route not found</strong>
              <p>{error}</p>
              <p className={styles.errorHint}>
                Try adjusting your accessibility preferences, or speak to a venue staff member.
              </p>
            </div>
          </div>
        )}

        {route && !loading && !error && (
          <div className={styles.routeResult} aria-label="Route result">
            {/* Summary */}
            <div className={styles.summary}>
              <div className={styles.summaryStats}>
                <div className={styles.stat}>
                  <div className={styles.statValue}>{route.estimatedMinutes}</div>
                  <div className={styles.statLabel}>min walk</div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.stat}>
                  <div className={styles.statValue}>{route.distanceMeters}</div>
                  <div className={styles.statLabel}>metres</div>
                </div>
                <div className={styles.statDivider} />
                <div className={styles.stat}>
                  <div className={styles.statValue}>{route.steps?.length}</div>
                  <div className={styles.statLabel}>steps</div>
                </div>
              </div>

              <div
                className={styles.accessStatus}
                style={{ color: accessStatusColor }}
                aria-label={`Accessibility status: ${route.accessibilityStatus}`}
              >
                {route.accessibilityStatus === 'fully-accessible' ? '♿ Fully accessible' :
                 route.accessibilityStatus === 'partially-accessible' ? '♿ Partially accessible' :
                 '⚠ Contains stairs'}
              </div>
            </div>

            {/* Warnings */}
            {route.warnings?.length > 0 && (
              <div className={styles.warnings} role="alert">
                {route.warnings.map((w, i) => (
                  <div key={i} className={styles.warning}>⚠ {w}</div>
                ))}
              </div>
            )}

            {/* Steps */}
            <div className={styles.steps} aria-label="Route directions">
              <h3 className={styles.stepsTitle}>Step-by-step directions</h3>
              <ol className={styles.stepList}>
                {route.steps?.map((step, i) => (
                  <li key={i} className={styles.step}>
                    <div className={styles.stepNumber} aria-hidden="true">{i + 1}</div>
                    <div className={styles.stepContent}>
                      <div className={styles.stepIcon} aria-hidden="true">
                        {ROUTE_TYPE_ICONS[step.type] || '🚶'}
                      </div>
                      <div className={styles.stepText}>{step.description}</div>
                    </div>
                  </li>
                ))}
                <li className={`${styles.step} ${styles.stepFinal}`}>
                  <div className={styles.stepNumber} aria-hidden="true">✓</div>
                  <div className={styles.stepContent}>
                    <div className={styles.stepIcon}>🏟️</div>
                    <div className={styles.stepText}>
                      <strong>Arrived at destination!</strong>
                    </div>
                  </div>
                </li>
              </ol>
            </div>

            <div className={styles.routeMeta}>
              <span>Route ID: <code>{route.routeId?.slice(0, 8)}</code></span>
              <span>· Data: {route.snapshotVersion}</span>
              <span>· Generated: {new Date(route.generatedAt).toLocaleTimeString()}</span>
            </div>

            <div className={styles.disclaimer}>
              ⚠ This route is based on simulated crowd data. Always follow venue staff instructions.
            </div>
          </div>
        )}

        {!route && !loading && !error && (
          <div className="empty-state">
            <div className="empty-state__icon">🧭</div>
            <div className="empty-state__title">Select start and destination</div>
            <p>Choose two points on the map or use the popular routes to get step-by-step directions.</p>
          </div>
        )}
      </div>
    </div>
  );
}
