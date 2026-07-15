/**
 * Operations login component with security-conscious design.
 */
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import styles from './OpsLogin.module.css';

export default function OpsLogin() {
  const { login, isLoading, error } = useAuth();
  const [code, setCode] = useState('');
  const [showHint, setShowHint] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await login(code);
  };

  return (
    <div className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />

      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.shield} aria-hidden="true">⚡</div>
          <h1 className={styles.title}>Operations Access</h1>
          <p className={styles.subtitle}>
            CrowdSphere AI — Command Centre
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label htmlFor="ops-access-code" className="form-label">
              Access Code
            </label>
            <input
              id="ops-access-code"
              type="password"
              className="form-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Enter operations access code"
              autoComplete="current-password"
              required
              aria-required="true"
              aria-describedby={error ? 'login-error' : 'login-hint'}
            />
          </div>

          {error && (
            <div id="login-error" className={styles.error} role="alert" aria-live="assertive">
              ✕ {error}
            </div>
          )}

          <button
            type="submit"
            id="ops-login-btn"
            className="btn btn-primary btn-lg"
            disabled={isLoading || !code.trim()}
            aria-busy={isLoading}
          >
            {isLoading
              ? <><span className="spinner spinner--sm" aria-hidden="true" /> Authenticating…</>
              : '→ Enter Operations Centre'
            }
          </button>
        </form>

        <div id="login-hint" className={styles.hint}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowHint(!showHint)}
            aria-expanded={showHint}
          >
            {showHint ? 'Hide' : 'Demo hint'}
          </button>
          {showHint && (
            <div className={styles.hintText} role="note">
              Demo access code: <code>crowdsphere-demo-2026</code>
            </div>
          )}
        </div>

        <div className={styles.securityNote}>
          <span aria-hidden="true">🔒</span>
          <span>
            Session expires after 15 minutes. Access code verified with constant-time comparison.
            Token stored in HttpOnly cookie.
          </span>
        </div>

        <p className={styles.disclaimer}>
          This is an independent demonstration prototype. Not for real operational use.
        </p>
      </div>
    </div>
  );
}
