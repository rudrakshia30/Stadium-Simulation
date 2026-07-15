/**
 * Announcement generator component.
 */
import { useState } from 'react';
import PropTypes from 'prop-types';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import styles from './OpsAnnouncements.module.css';

const AUDIENCES = ['fans', 'volunteers', 'accessibility-staff', 'transport-coordinators', 'security'];
const TONES = ['informational', 'urgent', 'reassuring', 'instructional'];
const LANGUAGES = [
  { code: 'en', label: '🇬🇧 English' },
  { code: 'hi', label: '🇮🇳 Hindi' },
  { code: 'es', label: '🇪🇸 Spanish' },
  { code: 'fr', label: '🇫🇷 French' },
  { code: 'ar', label: '🇸🇦 Arabic' },
];

export default function OpsAnnouncements({ snapshot }) {
  const toast = useToast();
  const [audience, setAudience] = useState('fans');
  const [language, setLanguage] = useState('en');
  const [tone, setTone] = useState('informational');
  const [maxLength, setMaxLength] = useState(200);
  const [incidentId, setIncidentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [approved, setApproved] = useState(false);
  const [history, setHistory] = useState([]);

  const activeIncidents = snapshot?.crowd?.incidents?.filter((i) => i.status !== 'resolved') || [];

  const generate = async () => {
    setLoading(true);
    setResult(null);
    setApproved(false);
    try {
      const data = await api.opsGenerateAnnouncement({
        audience, language, tone, maxLength: Number(maxLength),
        ...(incidentId ? { incidentId } : {}),
      });
      setResult(data);
      toast('Announcement generated — review before approving', 'success');
    } catch (err) {
      toast(`Failed to generate: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const approve = () => {
    setApproved(true);
    const entry = { ...result, approvedAt: new Date().toISOString(), audience, language, tone };
    setHistory((prev) => [entry, ...prev].slice(0, 10));
    toast('Announcement approved and logged', 'success');
  };

  return (
    <div className={styles.page}>
      <div className={styles.splitView}>
        {/* Config panel */}
        <div className={styles.configPanel}>
          <h2 className={styles.title}>📢 Announcement Generator</h2>
          <p className={styles.desc}>
            Generate AI-drafted announcements for specific audiences and situations.
            All announcements require approval before broadcast.
          </p>

          <div className={styles.form}>
            <div className="form-group">
              <label htmlFor="ann-audience" className="form-label">Audience</label>
              <select id="ann-audience" className="form-select" value={audience} onChange={(e) => setAudience(e.target.value)}>
                {AUDIENCES.map((a) => <option key={a} value={a}>{a.replace(/-/g, ' ')}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="ann-language" className="form-label">Language</label>
              <select id="ann-language" className="form-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="ann-tone" className="form-label">Tone</label>
              <select id="ann-tone" className="form-select" value={tone} onChange={(e) => setTone(e.target.value)}>
                {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="ann-length" className="form-label">Max length: {maxLength} characters</label>
              <input
                id="ann-length"
                type="range"
                className={styles.slider}
                min={50} max={500} step={50}
                value={maxLength}
                onChange={(e) => setMaxLength(e.target.value)}
                aria-label={`Maximum announcement length: ${maxLength} characters`}
              />
              <div className={styles.sliderLabels}><span>50</span><span>500</span></div>
            </div>

            {activeIncidents.length > 0 && (
              <div className="form-group">
                <label htmlFor="ann-incident" className="form-label">Linked incident (optional)</label>
                <select id="ann-incident" className="form-select" value={incidentId} onChange={(e) => setIncidentId(e.target.value)}>
                  <option value="">No specific incident</option>
                  {activeIncidents.map((i) => (
                    <option key={i.id} value={i.id}>
                      [{i.severity.toUpperCase()}] {i.type} — {i.zone}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              id="generate-announcement-btn"
              className="btn btn-primary"
              onClick={generate}
              disabled={loading}
              aria-busy={loading}
            >
              {loading ? <><span className="spinner spinner--sm" aria-hidden="true" /> Generating…</> : '✨ Generate Draft'}
            </button>
          </div>
        </div>

        {/* Result panel */}
        <div className={styles.resultPanel}>
          {!result && !loading && (
            <div className="empty-state">
              <div className="empty-state__icon">📢</div>
              <div className="empty-state__title">No draft yet</div>
              <p>Configure the announcement settings and click Generate to create a draft.</p>
            </div>
          )}

          {loading && (
            <div className="empty-state">
              <div className="spinner spinner--lg" />
              <p>Generating announcement…</p>
            </div>
          )}

          {result && !loading && (
            <div className={styles.result} aria-label="Generated announcement">
              <div className={styles.approvalBanner} role="alert">
                ⚠ This announcement requires review and approval before broadcast.
              </div>

              <div className={styles.announcementBox}>
                <div className={styles.announcementMeta}>
                  <span className="tag">Audience: {result.audience}</span>
                  <span className="tag">Language: {result.language}</span>
                  <span className="tag">Tone: {result.tone}</span>
                  <span className="tag">{result.characterCount} chars</span>
                </div>
                <p className={styles.announcementText}>
                  &quot;{result.announcement}&quot;
                </p>
              </div>

              {!approved ? (
                <div className={styles.approvalButtons}>
                  <button className="btn btn-primary" onClick={approve} id="approve-announcement-btn">
                    ✓ Approve for Broadcast
                  </button>
                  <button className="btn btn-secondary" onClick={generate}>
                    ↺ Regenerate
                  </button>
                </div>
              ) : (
                <div className={styles.approvedBadge} role="status">
                  ✓ Approved and logged at {new Date().toLocaleTimeString()}
                </div>
              )}
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div className={styles.history}>
              <h3 className={styles.historyTitle}>Recent Approved Announcements</h3>
              {history.map((h, i) => (
                <div key={i} className={`card ${styles.historyItem}`}>
                  <div className={styles.historyMeta}>
                    <span className="tag">{h.audience}</span>
                    <span className="tag">{h.language}</span>
                    <span className="tag">{h.tone}</span>
                    <span className={styles.historyTime}>{new Date(h.approvedAt).toLocaleTimeString()}</span>
                  </div>
                  <p className={styles.historyText}>&quot;{h.announcement}&quot;</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

OpsAnnouncements.propTypes = {
  snapshot: PropTypes.shape({
    crowd: PropTypes.shape({
      incidents: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        type: PropTypes.string,
        severity: PropTypes.string,
        zone: PropTypes.string,
        status: PropTypes.string,
      })),
    }),
  }),
};
