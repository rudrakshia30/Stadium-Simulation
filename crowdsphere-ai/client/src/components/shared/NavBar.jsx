import styles from './NavBar.module.css';

export default function NavBar({ activeView, onViewChange }) {
  return (
    <nav className={styles.navbar} role="navigation" aria-label="Main navigation">
      <div className={styles.brand}>
        <div className={styles.brandIcon} aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" fill="#1a1a2e" stroke="#7c3aed" strokeWidth="2"/>
            <circle cx="16" cy="16" r="8" fill="none" stroke="#7c3aed" strokeWidth="1.5" opacity="0.6"/>
            <circle cx="16" cy="16" r="3" fill="#a78bfa"/>
            <path d="M16 4 L16 12 M16 20 L16 28 M4 16 L12 16 M20 16 L28 16" stroke="#7c3aed" strokeWidth="1.5" opacity="0.4"/>
          </svg>
        </div>
        <div>
          <span className={styles.brandName}>CrowdSphere</span>
          <span className={styles.brandSuffix}> AI</span>
        </div>
      </div>

      <div className={styles.tabs} role="tablist">
        <button
          id="tab-fan"
          role="tab"
          aria-selected={activeView === 'fan'}
          aria-controls="panel-fan"
          className={`${styles.tab} ${activeView === 'fan' ? styles.tabActive : ''}`}
          onClick={() => onViewChange('fan')}
        >
          <span aria-hidden="true">🏟️</span>
          Fan Assistant
        </button>
        <button
          id="tab-ops"
          role="tab"
          aria-selected={activeView === 'ops'}
          aria-controls="panel-ops"
          className={`${styles.tab} ${activeView === 'ops' ? styles.tabActive : ''}`}
          onClick={() => onViewChange('ops')}
        >
          <span aria-hidden="true">⚡</span>
          Operations
        </button>
      </div>

      <div className={styles.badge}>
        <span className="status-dot status-dot--green" aria-hidden="true" />
        <span className={styles.badgeText}>Live Demo</span>
      </div>
    </nav>
  );
}
