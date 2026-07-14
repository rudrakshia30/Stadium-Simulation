/**
 * Operations Command Centre — main interface after login.
 * Tabs: Dashboard | Scenarios | AI Brief | Announcements | Risk Analysis
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api } from '../../api/client.js';
import OpsDashboard from './OpsDashboard.jsx';
import OpsScenarios from './OpsScenarios.jsx';
import OpsBrief from './OpsBrief.jsx';
import OpsAnnouncements from './OpsAnnouncements.jsx';
import OpsRiskAnalysis from './OpsRiskAnalysis.jsx';
import styles from './OpsCommandCentre.module.css';

const OPS_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'scenarios', label: 'Scenarios', icon: '🎭' },
  { id: 'brief', label: 'AI Brief', icon: '⚡' },
  { id: 'announcements', label: 'Announcements', icon: '📢' },
  { id: 'risk', label: 'Risk Analysis', icon: '🎯' },
];

export default function OpsCommandCentre() {
  const { logout } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const data = await api.opsSnapshot();
      setSnapshot(data);
      setLastRefresh(new Date());
    } catch (err) {
      if (err.code !== 'ABORTED') {
        toast('Failed to refresh snapshot. Check server connection.', 'error');
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchSnapshot();
    const iv = setInterval(fetchSnapshot, 30000);
    return () => clearInterval(iv);
  }, [fetchSnapshot]);

  const handleLogout = async () => {
    await logout();
    toast('Logged out successfully', 'info');
  };

  const overallRisk = snapshot?.metrics?.overallRisk || 'unknown';

  return (
    <div className={styles.occ}>
      {/* OCC Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.occBadge}>
            <span className="status-dot status-dot--green" aria-hidden="true" />
            <span>OCC LIVE</span>
          </div>
          <div>
            <h1 className={styles.title}>Operations Command Centre</h1>
            <p className={styles.scenario}>
              {snapshot?.scenarioName || 'Loading…'}
              {lastRefresh && (
                <span className={styles.refreshTime}>
                  · Updated {lastRefresh.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className={styles.headerRight}>
          {snapshot && (
            <div className={`risk-badge risk-badge--${overallRisk}`} aria-label={`Overall risk: ${overallRisk}`}>
              <span aria-hidden="true">🎯</span>
              {overallRisk.toUpperCase()} RISK
            </div>
          )}
          <button
            id="ops-refresh-btn"
            className="btn btn-secondary btn-sm"
            onClick={fetchSnapshot}
            disabled={loading}
            aria-label="Refresh snapshot"
          >
            {loading ? <span className="spinner spinner--sm" aria-hidden="true" /> : '↻'} Refresh
          </button>
          <button
            id="ops-logout-btn"
            className="btn btn-ghost btn-sm"
            onClick={handleLogout}
            aria-label="Log out of operations"
          >
            Log out
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className={styles.tabBar} role="tablist" aria-label="Operations sections">
        {OPS_TABS.map((tab) => (
          <button
            key={tab.id}
            id={`ops-tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`ops-panel-${tab.id}`}
            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span aria-hidden="true">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className={styles.content}>
        {OPS_TABS.map((tab) => (
          <div
            key={tab.id}
            id={`ops-panel-${tab.id}`}
            role="tabpanel"
            aria-labelledby={`ops-tab-${tab.id}`}
            hidden={activeTab !== tab.id}
            className={styles.panel}
          >
            {activeTab === tab.id && (
              <>
                {tab.id === 'dashboard' && <OpsDashboard snapshot={snapshot} loading={loading} />}
                {tab.id === 'scenarios' && <OpsScenarios snapshot={snapshot} onScenarioChange={fetchSnapshot} />}
                {tab.id === 'brief' && <OpsBrief snapshot={snapshot} />}
                {tab.id === 'announcements' && <OpsAnnouncements snapshot={snapshot} />}
                {tab.id === 'risk' && <OpsRiskAnalysis snapshot={snapshot} />}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
