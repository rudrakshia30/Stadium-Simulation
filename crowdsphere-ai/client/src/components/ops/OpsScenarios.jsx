/**
 * Scenario selector — lets ops staff load simulation scenarios.
 */
import { useState } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import styles from './OpsScenarios.module.css';

const SCENARIOS = [
  { id: 'normal-entry', name: 'Normal Match Entry', icon: '🟢', severity: 'low', desc: 'Standard pre-match conditions. All systems operational.' },
  { id: 'gate-d-surge', name: 'Sudden Crowd Surge at Gate D', icon: '🔴', severity: 'critical', desc: 'Unexpected surge at Gate D. Critical occupancy. Immediate volunteer deployment required.' },
  { id: 'medical-incident-214', name: 'Medical Incident near Section 214', icon: '🏥', severity: 'high', desc: 'Fan requires urgent medical assistance near Section 214.' },
  { id: 'elevator-unavailable', name: 'Accessible Elevator Unavailable', icon: '🛗', severity: 'high', desc: 'North elevator out of service. Affects accessible access to Sections 214 and 215.' },
  { id: 'metro-disruption', name: 'Metro Service Disruption', icon: '🚇', severity: 'high', desc: 'Metro suspended due to track fault. Increased load on bus and shuttle services.' },
  { id: 'post-match-exit', name: 'Post-Match Mass Exit', icon: '🌊', severity: 'high', desc: 'Final whistle. 60,000 fans exiting simultaneously. All zones critical.' },
  { id: 'heavy-rain', name: 'Heavy Rain — Slippery Concourse', icon: '🌧', severity: 'moderate', desc: 'Slip hazards on outdoor concourses. Reduced safe capacity in affected areas.' },
  { id: 'lost-child', name: 'Lost Child Report', icon: '👧', severity: 'high', desc: 'Child separated from family near North Concourse. Family assistance team activated.' },
  { id: 'volunteer-shortage', name: 'Volunteer Shortage', icon: '🦺', severity: 'moderate', desc: 'Coverage below minimum threshold in East and South concourses.' },
  { id: 'movement-conflict', name: 'Movement Conflict — North Concourse', icon: '⚠', severity: 'high', desc: 'Bidirectional crowd movement creating pressure point. One-way system may be required.' },
];

export default function OpsScenarios({ snapshot, onScenarioChange }) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState(snapshot?.scenarioId || 'normal-entry');

  const activateScenario = async (scenarioId) => {
    setLoading(true);
    try {
      await api.opsSetScenario({ scenarioId });
      setSelectedId(scenarioId);
      onScenarioChange();
      const sc = SCENARIOS.find((s) => s.id === scenarioId);
      toast(`Scenario activated: ${sc?.name}`, 'success');
    } catch (err) {
      toast(`Failed to activate scenario: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Simulation Scenarios</h2>
        <p className={styles.desc}>
          Each scenario loads a pre-configured crowd state, incident set, and transport status.
          Activate a scenario to see how CrowdSphere AI responds to different situations.
        </p>
        <div className={styles.demoBadge}>
          <span>🎭</span>
          All scenarios use simulated data only. No real operational impact.
        </div>
      </div>

      <div className={styles.grid}>
        {SCENARIOS.map((sc) => {
          const isActive = selectedId === sc.id;
          return (
            <div
              key={sc.id}
              className={`card ${styles.scenarioCard} ${isActive ? styles.scenarioCardActive : ''}`}
            >
              <div className={styles.scIcon}>{sc.icon}</div>
              <div className={styles.scContent}>
                <div className={styles.scHeader}>
                  <div className={styles.scName}>{sc.name}</div>
                  <span className={`risk-badge risk-badge--${sc.severity}`}>{sc.severity}</span>
                </div>
                <p className={styles.scDesc}>{sc.desc}</p>
              </div>
              <button
                className={`btn ${isActive ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                onClick={() => activateScenario(sc.id)}
                disabled={loading || isActive}
                aria-label={`Activate scenario: ${sc.name}`}
                aria-pressed={isActive}
              >
                {isActive ? '✓ Active' : 'Activate'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
