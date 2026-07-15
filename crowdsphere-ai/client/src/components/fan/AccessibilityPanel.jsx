/**
 * Accessibility preferences panel.
 */
import PropTypes from 'prop-types';
import styles from './AccessibilityPanel.module.css';

const PREF_OPTIONS = [
  { key: 'wheelchair', label: 'Wheelchair user', icon: '♿', description: 'Route will avoid all stairs and use accessible lifts and ramps' },
  { key: 'stepFree', label: 'Step-free access required', icon: '🚶', description: 'No steps, stairs or escalators on this route' },
  { key: 'avoidStairs', label: 'Prefer to avoid stairs', icon: '🪜', description: 'Stairs avoided where possible, but not fully excluded' },
  { key: 'avoidCrowds', label: 'Avoid busy areas', icon: '👥', description: 'Route will prefer less-congested zones' },
  { key: 'elderly', label: 'Elderly or limited mobility', icon: '🦯', description: 'Prefer shorter, easier routes with resting spots' },
  { key: 'sensoryFriendly', label: 'Sensory-friendly guidance', icon: '🔇', description: 'Avoid loud or crowded areas; prefer quiet routes' },
];

const FACILITY_INFO = [
  { icon: '♿', title: 'Accessible Toilets', desc: 'Available near North Hub, East and South Concourses', nodes: ['acc-toilet-n', 'acc-toilet-e', 'acc-toilet-s'] },
  { icon: '🛗', title: 'Elevators', desc: 'Serving all levels. Check for outages in real-time.', nodes: ['elevator-n', 'elevator-e', 'elevator-s'] },
  { icon: '⬆️', title: 'Ramps', desc: 'Step-free ramps at North Hub and East Concourse', nodes: ['ramp-n', 'ramp-e'] },
  { icon: '🔇', title: 'Quiet Sensory Room', desc: 'North Accessible Hub, Level 1 — available for all visitors', nodes: ['sensory-room'] },
  { icon: '🕌', title: 'Prayer Room', desc: 'West Concourse, Level 1 — multi-faith', nodes: ['prayer-room'] },
  { icon: '👨‍👩‍👧', title: 'Family Assistance Desk', desc: 'Accessible Hub — lost children, family services', nodes: ['family-desk'] },
  { icon: '♿', title: 'Accessible Transport Hub', desc: 'North exit — wheelchair accessible vehicles available', nodes: ['accessible-transport'] },
  { icon: '🏥', title: 'Medical Rooms', desc: 'North and South Concourses — first aid available', nodes: ['medical-n', 'medical-s'] },
];

export default function AccessibilityPanel({ preferences, onPreferencesChange }) {
  const toggle = (key) => {
    const updated = { ...preferences, [key]: !preferences[key] };
    // If wheelchair or stepFree enabled, also enable avoidStairs
    if ((key === 'wheelchair' || key === 'stepFree') && updated[key]) {
      updated.avoidStairs = true;
    }
    onPreferencesChange(updated);
  };

  const activeCount = Object.values(preferences).filter(Boolean).length;

  return (
    <div className={styles.panel}>
      <div className={styles.sidebar}>
        <h2 className={styles.title}>Accessibility Preferences</h2>
        <p className={styles.desc}>
          Set your accessibility requirements. All routes and AI responses will adapt to your preferences.
        </p>

        {activeCount > 0 && (
          <div className={styles.activeBanner} role="status" aria-live="polite">
            <span>✓</span>
            <span>{activeCount} preference{activeCount > 1 ? 's' : ''} active</span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => onPreferencesChange(Object.keys(preferences).reduce((a, k) => ({ ...a, [k]: false }), {}))}
            >
              Reset all
            </button>
          </div>
        )}

        <div className={styles.options} role="group" aria-label="Accessibility preferences">
          {PREF_OPTIONS.map((opt) => (
            <label
              key={opt.key}
              className={`${styles.optionCard} ${preferences[opt.key] ? styles.optionCardActive : ''}`}
              htmlFor={`pref-${opt.key}`}
            >
              <div className={styles.optionTop}>
                <span className={styles.optionIcon} aria-hidden="true">{opt.icon}</span>
                <div className={styles.optionText}>
                  <div className={styles.optionLabel}>{opt.label}</div>
                  <div className={styles.optionDesc}>{opt.description}</div>
                </div>
                <div className={styles.toggle} aria-hidden="true">
                  <div className={`${styles.toggleThumb} ${preferences[opt.key] ? styles.toggleThumbOn : ''}`} />
                </div>
              </div>
              <input
                type="checkbox"
                id={`pref-${opt.key}`}
                checked={preferences[opt.key] || false}
                onChange={() => toggle(opt.key)}
                className="visually-hidden"
                aria-describedby={`pref-${opt.key}-desc`}
              />
              <div id={`pref-${opt.key}-desc`} className="visually-hidden">{opt.description}</div>
            </label>
          ))}
        </div>
      </div>

      <div className={styles.main}>
        <h2 className={styles.facilityTitle}>Accessible Facilities</h2>
        <p className={styles.facilityDesc}>All facilities below are available at Unity Arena (simulated).</p>

        <div className={styles.facilities}>
          {FACILITY_INFO.map((f, i) => (
            <div key={i} className={`card ${styles.facilityCard}`}>
              <div className={styles.facilityIcon}>{f.icon}</div>
              <div>
                <div className={styles.facilityName}>{f.title}</div>
                <div className={styles.facilityLocation}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.emergencyBox} role="complementary" aria-label="Emergency contacts">
          <div className={styles.emergencyTitle}>🆘 Need immediate assistance?</div>
          <p>Visit any <strong>Volunteer Station</strong> or <strong>Information Desk</strong> throughout the venue. Staff are available at all gates and concourses.</p>
          <p>For <strong>medical emergencies</strong>, the nearest medical rooms are in the North and South Concourses.</p>
          <p className={styles.emergencyNote}>This is a demonstration prototype. In a real emergency, contact venue staff directly.</p>
        </div>
      </div>
    </div>
  );
}

AccessibilityPanel.propTypes = {
  preferences: PropTypes.object.isRequired,
  onPreferencesChange: PropTypes.func.isRequired,
};
