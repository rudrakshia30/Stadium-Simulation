/**
 * Venue Map — SVG-based interactive stadium map with zone overlays.
 * Shows crowd density heat map and allows node selection for routing.
 */
import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { api } from '../../api/client.js';
import styles from './VenueMap.module.css';

const DENSITY_COLORS = {
  low:      'rgba(16,185,129,0.35)',
  moderate: 'rgba(245,158,11,0.35)',
  high:     'rgba(249,115,22,0.45)',
  critical: 'rgba(239,68,68,0.55)',
  unknown:  'rgba(124,58,237,0.15)',
};

const DENSITY_STROKE = {
  low:      '#10b981',
  moderate: '#f59e0b',
  high:     '#f97316',
  critical: '#ef4444',
  unknown:  '#7c3aed',
};

const ZONE_POSITIONS = {
  'zone-north-concourse':   { x: 25, y: 5,  w: 50, h: 18 },
  'zone-east-concourse':    { x: 78, y: 25, w: 18, h: 50 },
  'zone-south-concourse':   { x: 25, y: 78, w: 50, h: 18 },
  'zone-west-concourse':    { x: 4,  y: 25, w: 18, h: 50 },
  'zone-accessible-hub':    { x: 4,  y: 5,  w: 20, h: 18 },
  'zone-gate-a-plaza':      { x: 38, y: 0,  w: 24, h: 6 },
  'zone-gate-b-plaza':      { x: 94, y: 38, w: 6,  h: 24 },
  'zone-gate-c-plaza':      { x: 38, y: 94, w: 24, h: 6 },
  'zone-gate-d-plaza':      { x: 0,  y: 38, w: 6,  h: 24 },
};

const ICON_BY_TYPE = {
  toilet: '🚻', accessible_toilet: '♿', medical: '🏥', water_refill: '💧',
  food: '🍕', information: 'ℹ', prayer_room: '🕌', sensory_room: '🔇',
  family_assistance: '👨‍👩‍👧', lost_found: '🔍', volunteer_station: '🦺',
  elevator: '🛗', emergency_exit: '🚪', recycling: '♻',
};

export default function VenueMap({ venueData, preferences: _preferences, onRouteRequest }) {
  const [crowdData, setCrowdData] = useState(null);
  const [selectedFrom, setSelectedFrom] = useState(null);
  const [selectedTo, setSelectedTo] = useState(null);
  const [hoveredZone, setHoveredZone] = useState(null);
  const [facilityFilter, setFacilityFilter] = useState('all');

  useEffect(() => {
    api.opsSnapshot().catch(() => {}).then((data) => {
      if (data?.crowd?.zones) setCrowdData(data.crowd.zones);
    });
    const iv = setInterval(() => {
      api.opsSnapshot().catch(() => {}).then((data) => {
        if (data?.crowd?.zones) setCrowdData(data.crowd.zones);
      });
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  const getZoneDensity = (zoneId) => {
    if (!crowdData) return 'unknown';
    return crowdData.find((z) => z.id === zoneId)?.densityLevel || 'unknown';
  };

  const getZoneData = (zoneId) => crowdData?.find((z) => z.id === zoneId);

  const handleNodeClick = (nodeId) => {
    if (!selectedFrom) {
      setSelectedFrom(nodeId);
    } else if (nodeId !== selectedFrom) {
      setSelectedTo(nodeId);
    } else {
      setSelectedFrom(null);
    }
  };

  const handleRoute = () => {
    if (selectedFrom && selectedTo) {
      onRouteRequest(selectedFrom, selectedTo);
    }
  };

  const clearSelection = () => { setSelectedFrom(null); setSelectedTo(null); };

  const facilities = venueData?.facilities?.filter((f) =>
    facilityFilter === 'all' ? true :
    facilityFilter === 'accessible' ? f.accessible :
    f.type === facilityFilter
  ) || [];

  return (
    <div className={styles.mapContainer}>
      <div className={styles.mapControls}>
        <div className={styles.controlGroup}>
          <span className={styles.controlLabel}>Show facilities:</span>
          {['all', 'toilet', 'accessible_toilet', 'medical', 'water_refill', 'food', 'accessible'].map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${facilityFilter === f ? styles.filterBtnActive : ''}`}
              onClick={() => setFacilityFilter(f)}
              aria-pressed={facilityFilter === f}
            >
              {f === 'all' ? 'All' : f === 'accessible' ? '♿ Accessible' : `${ICON_BY_TYPE[f] || '•'} ${f.replace(/_/g, ' ')}`}
            </button>
          ))}
        </div>

        {(selectedFrom || selectedTo) && (
          <div className={styles.selectionBar}>
            <span>From: <strong>{selectedFrom || '—'}</strong></span>
            <span>To: <strong>{selectedTo || '(click destination)'}</strong></span>
            {selectedFrom && selectedTo && (
              <button className="btn btn-primary btn-sm" onClick={handleRoute}>
                Get Route →
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={clearSelection}>Clear</button>
          </div>
        )}
      </div>

      <div className={styles.mapWrapper}>
        <svg
          viewBox="0 0 100 100"
          className={styles.svg}
          role="img"
          aria-label="Unity Arena interactive venue map"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="0.5" result="blur"/>
              <feComposite in="SourceGraphic" in2="blur" operator="over"/>
            </filter>
          </defs>

          {/* Stadium outline */}
          <rect x="10" y="10" width="80" height="80" rx="8" fill="rgba(18,18,42,0.8)" stroke="rgba(124,58,237,0.4)" strokeWidth="0.5"/>

          {/* Pitch */}
          <ellipse cx="50" cy="50" rx="22" ry="18" fill="rgba(16,100,50,0.6)" stroke="rgba(16,185,129,0.3)" strokeWidth="0.3"/>
          <ellipse cx="50" cy="50" rx="12" ry="10" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="0.2"/>
          <line x1="50" y1="32" x2="50" y2="68" stroke="rgba(255,255,255,0.15)" strokeWidth="0.2"/>

          {/* Zone overlays */}
          {Object.entries(ZONE_POSITIONS).map(([zoneId, pos]) => {
            const density = getZoneDensity(zoneId);
            const zoneInfo = getZoneData(zoneId);
            const isHovered = hoveredZone === zoneId;
            return (
              <g key={zoneId}>
                <rect
                  x={pos.x} y={pos.y} width={pos.w} height={pos.h}
                  rx="2"
                  fill={DENSITY_COLORS[density]}
                  stroke={DENSITY_STROKE[density]}
                  strokeWidth={isHovered ? 0.6 : 0.3}
                  opacity={isHovered ? 1 : 0.8}
                  style={{ cursor: 'pointer', transition: 'all 0.2s' }}
                  onMouseEnter={() => setHoveredZone(zoneId)}
                  onMouseLeave={() => setHoveredZone(null)}
                  onClick={() => handleNodeClick(zoneId)}
                  tabIndex={0}
                  role="button"
                  aria-label={`${zoneId.replace(/-/g,'  ')} — ${density} density${zoneInfo ? `, ${zoneInfo.occupancyPct}% occupancy` : ''}`}
                  onKeyDown={(e) => e.key === 'Enter' && handleNodeClick(zoneId)}
                />
                {isHovered && zoneInfo && (
                  <text x={pos.x + pos.w/2} y={pos.y + pos.h/2} textAnchor="middle" dominantBaseline="middle"
                    fill="white" fontSize="2" fontWeight="bold" style={{ pointerEvents: 'none' }}>
                    {zoneInfo.occupancyPct}%
                  </text>
                )}
                {selectedFrom === zoneId && (
                  <rect x={pos.x-0.5} y={pos.y-0.5} width={pos.w+1} height={pos.h+1} rx="2.5"
                    fill="none" stroke="#a78bfa" strokeWidth="0.8" strokeDasharray="1,1"/>
                )}
                {selectedTo === zoneId && (
                  <rect x={pos.x-0.5} y={pos.y-0.5} width={pos.w+1} height={pos.h+1} rx="2.5"
                    fill="none" stroke="#2dd4bf" strokeWidth="0.8" strokeDasharray="1,1"/>
                )}
              </g>
            );
          })}

          {/* Gates */}
          {venueData?.gates?.map((gate) => (
            <g key={gate.id} onClick={() => handleNodeClick(gate.id)} style={{ cursor: 'pointer' }}>
              <circle
                cx={gate.x} cy={gate.y} r="2.5"
                fill={gate.accessible ? '#2dd4bf' : '#7c3aed'}
                stroke="white" strokeWidth="0.4"
                filter="url(#glow)"
              />
              <text x={gate.x} y={gate.y - 3.5} textAnchor="middle"
                fill="white" fontSize="2" fontWeight="600">
                {gate.name.replace('Gate ', '')}
              </text>
              {gate.accessible && (
                <text x={gate.x + 3} y={gate.y + 1} fontSize="2.5" fill="#2dd4bf">♿</text>
              )}
            </g>
          ))}

          {/* Sections */}
          {venueData?.sections?.map((sec) => (
            <g key={sec.id} onClick={() => handleNodeClick(sec.id)} style={{ cursor: 'pointer' }}>
              <rect x={sec.x - 3} y={sec.y - 2} width="6" height="4" rx="1"
                fill="rgba(124,58,237,0.4)"
                stroke={selectedFrom === sec.id ? '#a78bfa' : selectedTo === sec.id ? '#2dd4bf' : 'rgba(124,58,237,0.6)'}
                strokeWidth={selectedFrom === sec.id || selectedTo === sec.id ? 0.6 : 0.3}
              />
              <text x={sec.x} y={sec.y + 0.8} textAnchor="middle" dominantBaseline="middle"
                fill="white" fontSize="1.6" fontWeight="500">
                {sec.name.replace('Section ', '')}
              </text>
              {sec.accessibleSeating && (
                <text x={sec.x + 4} y={sec.y} fontSize="1.8" fill="#2dd4bf">♿</text>
              )}
            </g>
          ))}

          {/* Facilities */}
          {facilities.map((f) => (
            <text key={f.id} x={f.x} y={f.y} fontSize="2.5" textAnchor="middle"
              style={{ cursor: 'pointer' }}
              aria-label={f.name}
              role="img"
            >
              {ICON_BY_TYPE[f.type] || '•'}
            </text>
          ))}

          {/* Transport points */}
          {venueData?.transportPoints?.map((tp) => (
            <g key={tp.id}>
              <circle cx={Math.max(1, Math.min(99, tp.x))} cy={Math.max(1, Math.min(99, tp.y))} r="2"
                fill="#38bdf8" stroke="white" strokeWidth="0.3" opacity="0.9"/>
            </g>
          ))}
        </svg>

        {/* Legend */}
        <div className={styles.legend} aria-label="Map legend">
          <div className={styles.legendTitle}>Crowd Density</div>
          {['low', 'moderate', 'high', 'critical'].map((d) => (
            <div key={d} className={styles.legendItem}>
              <div className={styles.legendSwatch} style={{ background: DENSITY_COLORS[d], border: `1px solid ${DENSITY_STROKE[d]}` }} />
              <span>{d}</span>
            </div>
          ))}
          <div className={styles.divider} />
          <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: '#7c3aed' }} /><span>Gate</span></div>
          <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: '#2dd4bf' }} /><span>Accessible</span></div>
          <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: '#38bdf8' }} /><span>Transport</span></div>
        </div>
      </div>

      {!selectedFrom && (
        <p className={styles.hint} aria-live="polite">
          💡 Click any zone, gate, or section to select a start point for routing
        </p>
      )}
      {selectedFrom && !selectedTo && (
        <p className={styles.hint} aria-live="polite">
          ✓ Start: <strong>{selectedFrom}</strong> — now click a destination
        </p>
      )}
    </div>
  );
}

VenueMap.propTypes = {
  venueData: PropTypes.shape({
    gates: PropTypes.arrayOf(PropTypes.object),
    sections: PropTypes.arrayOf(PropTypes.object),
    facilities: PropTypes.arrayOf(PropTypes.object),
    transportPoints: PropTypes.arrayOf(PropTypes.object),
    nodes: PropTypes.arrayOf(PropTypes.string),
  }),
  preferences: PropTypes.object,
  onRouteRequest: PropTypes.func.isRequired,
};
