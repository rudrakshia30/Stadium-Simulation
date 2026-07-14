/**
 * AI Operations Brief component.
 * Generates and displays AI-powered operations recommendations.
 * ALWAYS renders humanApprovalRequired banner.
 */
import { useState } from 'react';
import { api } from '../../api/client.js';
import { useToast } from '../../context/ToastContext.jsx';
import styles from './OpsBrief.module.css';

function PriorityCard({ priority }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`card ${styles.priorityCard}`}
      style={{ borderLeft: `3px solid var(--risk-${priority.severity})` }}>
      <div className={styles.priorityHeader}>
        <div className={styles.priorityRank} aria-label={`Priority ${priority.rank}`}>
          {priority.rank}
        </div>
        <div className={styles.priorityMeta}>
          <div className={styles.priorityTitle}>{priority.title}</div>
          <div className={styles.priorityFooter}>
            <span className={`risk-badge risk-badge--${priority.severity}`}>{priority.severity}</span>
            <span className="tag">⏱ {priority.targetResponseMinutes} min target</span>
            <span className="tag">👤 {priority.responsibleRole}</span>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} priority ${priority.rank} details`}
        >
          {expanded ? '▲' : '▼'}
        </button>
      </div>

      {expanded && (
        <div className={styles.priorityDetails}>
          <div className={styles.detailSection}>
            <div className={styles.detailTitle}>📋 Rationale</div>
            <p className={styles.detailText}>{priority.rationale}</p>
          </div>
          <div className={styles.detailSection}>
            <div className={styles.detailTitle}>✓ Verified Evidence</div>
            <ul className={styles.detailList}>
              {priority.verifiedEvidence.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
          <div className={styles.detailSection}>
            <div className={styles.detailTitle}>→ Recommended Actions</div>
            <ul className={styles.detailList}>
              {priority.recommendedActions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
          <div className={styles.detailSection}>
            <div className={styles.detailTitle}>🗺 Affected Zones</div>
            <div className={styles.tags}>
              {priority.affectedZones.map((z, i) => <span key={i} className="tag">{z.replace(/-/g, ' ')}</span>)}
            </div>
          </div>
          <div className={styles.approvalRequired} role="note">
            ⚠ All recommended actions require human approval before implementation.
          </div>
        </div>
      )}
    </div>
  );
}

export default function OpsBrief({ snapshot }) {
  const toast = useToast();
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const generateBrief = async () => {
    setLoading(true);
    setBrief(null);
    try {
      const data = await api.opsGenerateBrief({});
      setBrief(data);
      setDemoMode(!snapshot?.geminiAvailable);
      toast('Operations brief generated', 'success');
    } catch (err) {
      toast(`Brief generation failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h2 className={styles.title}>⚡ AI Operations Brief</h2>
          <p className={styles.desc}>
            Gemini analyzes the current venue state and generates a prioritized operations brief.
            All recommendations require human approval before implementation.
          </p>
        </div>
        <button
          id="generate-brief-btn"
          className="btn btn-primary"
          onClick={generateBrief}
          disabled={loading}
          aria-busy={loading}
        >
          {loading
            ? <><span className="spinner spinner--sm" aria-hidden="true" /> Generating…</>
            : '⚡ Generate Brief'
          }
        </button>
      </div>

      {demoMode && brief && (
        <div className={styles.demoNotice} role="note">
          <span>🎭</span>
          <span>
            <strong>Demo Mode:</strong> Gemini API key not configured. Showing pre-built fixture response.
            Configure <code>GEMINI_API_KEY</code> in the server <code>.env</code> for live AI responses.
          </span>
        </div>
      )}

      {loading && (
        <div className={styles.loadingState}>
          <div className="spinner spinner--lg" aria-label="Generating AI brief" />
          <p>Gemini is analyzing the venue state and generating your operations brief…</p>
          <p className={styles.loadingHint}>This typically takes 5–15 seconds</p>
        </div>
      )}

      {brief && !loading && (
        <div className={styles.briefContent} aria-label="Operations brief">
          {/* Human approval banner — always shown */}
          <div className={styles.approvalBanner} role="alert" aria-live="assertive">
            <span aria-hidden="true">⚠</span>
            <div>
              <strong>Human Approval Required</strong> — All priorities and recommendations in this brief
              require review and approval by an authorised operations officer before implementation.
              This is an AI-generated analysis, not an automated directive.
            </div>
          </div>

          {/* Overview */}
          <div className={`card ${styles.overviewCard}`}>
            <div className={styles.overviewTop}>
              <div>
                <div className={styles.overviewLabel}>Overall Risk Assessment</div>
                <div className={`risk-badge risk-badge--${brief.overallRisk}`} style={{ fontSize: '1rem', padding: '6px 16px', marginTop: '8px' }}>
                  {brief.overallRisk?.toUpperCase()}
                </div>
              </div>
              <div className={styles.overviewRight}>
                <span className="tag">Generated: {new Date(brief.generatedAt).toLocaleTimeString()}</span>
                <span className={`tag`}>AI confidence: {brief.confidence}</span>
                <span className={`tag`}>Gemini: {snapshot?.geminiAvailable ? '✓ Live' : '⚠ Demo'}</span>
              </div>
            </div>
            <div className={styles.divider} />
            <div className={styles.executiveSummary}>
              <div className={styles.overviewLabel}>Executive Summary</div>
              <p className={styles.summaryText}>{brief.executiveSummary}</p>
            </div>
          </div>

          {/* Priorities */}
          <div>
            <h3 className={styles.sectionTitle}>Operational Priorities ({brief.priorities?.length})</h3>
            <div className={styles.priorityList}>
              {brief.priorities?.map((p) => <PriorityCard key={p.rank} priority={p} />)}
            </div>
          </div>

          {/* Fan Communication */}
          <div className={`card ${styles.fanCommCard}`}>
            <h3 className={styles.sectionTitle}>📢 Suggested Fan Communication</h3>
            <div className={styles.fanCommMessage}>
              <div className={styles.fanCommLang}>Language: {brief.fanCommunication?.language}</div>
              <p className={styles.fanCommText}>"{brief.fanCommunication?.message}"</p>
            </div>
            <div className={styles.approvalRequired} role="note">
              ⚠ This message requires approval and editing before broadcast.
            </div>
          </div>

          {/* Volunteer instructions */}
          {brief.volunteerInstructions?.length > 0 && (
            <div className={`card ${styles.volCard}`}>
              <h3 className={styles.sectionTitle}>🦺 Volunteer Instructions</h3>
              <ul className={styles.volList}>
                {brief.volunteerInstructions.map((v, i) => <li key={i}>{v}</li>)}
              </ul>
              <div className={styles.approvalRequired} role="note">
                ⚠ Deploy volunteers only after supervisor approval.
              </div>
            </div>
          )}

          {/* Uncertainties */}
          {(brief.uncertainties?.length > 0 || brief.missingInformation?.length > 0) && (
            <div className={`card ${styles.uncertaintyCard}`}>
              <h3 className={styles.sectionTitle}>⚠ Limitations & Uncertainties</h3>
              {brief.uncertainties?.map((u, i) => <div key={i} className={styles.uncertaintyItem}>~ {u}</div>)}
              {brief.missingInformation?.map((m, i) => <div key={i} className={styles.uncertaintyItem}>? {m}</div>)}
            </div>
          )}
        </div>
      )}

      {!brief && !loading && (
        <div className="empty-state">
          <div className="empty-state__icon">⚡</div>
          <div className="empty-state__title">No brief generated yet</div>
          <p>Click "Generate Brief" to ask Gemini to analyze the current venue state and produce a prioritized operations brief.</p>
        </div>
      )}
    </div>
  );
}
