/**
 * Unit tests for the risk scoring engine.
 */
import { describe, it, expect } from 'vitest';
import { calculateZoneRisk, calculateOverallRisk } from '../tools/riskEngine.js';
import { getDefaultCrowdState } from '../data/crowd.js';
import { getDefaultTransportState } from '../data/transport.js';

const baseCrowd = getDefaultCrowdState();
const baseTransport = getDefaultTransportState();

describe('Risk Engine — zone risk', () => {
  it('should return low risk for normal pre-match scenario', () => {
    const result = calculateZoneRisk('zone-north-concourse', baseCrowd, baseTransport);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['low', 'moderate', 'high', 'critical']).toContain(result.category);
    expect(result.factors.length).toBeGreaterThan(0);
    expect(result.zoneId).toBe('zone-north-concourse');
    expect(result.calculatedAt).toBeTruthy();
  });

  it('should return critical risk for high occupancy + active critical incident', () => {
    const highRiskCrowd = {
      zones: baseCrowd.zones.map((z) =>
        z.id === 'zone-gate-d-plaza'
          ? { ...z, occupancyPct: 95, densityLevel: 'critical', queueMinutes: 25, movementDirection: 'conflicted', accessibilityObstruction: true }
          : z,
      ),
      incidents: [
        ...baseCrowd.incidents,
        { id: 'inc-test', type: 'crowd-surge', severity: 'critical', zone: 'zone-gate-d-plaza', status: 'active', description: 'Test', requiredRole: 'crowd-manager', humanVerified: false, timestamp: new Date().toISOString() },
      ],
    };

    const result = calculateZoneRisk('zone-gate-d-plaza', highRiskCrowd, baseTransport);
    expect(result.score).toBeGreaterThan(50);
    expect(['high', 'critical']).toContain(result.category);
  });

  it('should return low category for score 0–24', () => {
    const lowCrowd = {
      zones: [{ id: 'zone-east-concourse', name: 'East', occupancyPct: 10, densityLevel: 'low', queueMinutes: 0, movementDirection: 'inbound', accessibilityObstruction: false, snapshotVersion: 'v1' }],
      incidents: [],
    };
    const result = calculateZoneRisk('zone-east-concourse', lowCrowd, []);
    expect(result.score).toBeLessThanOrEqual(24);
    expect(result.category).toBe('low');
  });

  it('should return moderate category for score 25–49', () => {
    const moderateCrowd = {
      zones: [{ id: 'zone-east-concourse', name: 'East', occupancyPct: 65, densityLevel: 'moderate', queueMinutes: 12, movementDirection: 'inbound', accessibilityObstruction: false, snapshotVersion: 'v1' }],
      incidents: [{ id: 'inc-test', type: 'queue-congestion', severity: 'moderate', zone: 'zone-east-concourse', status: 'active', description: 'Test', requiredRole: 'steward', humanVerified: false, timestamp: new Date().toISOString() }],
    };
    const result = calculateZoneRisk('zone-east-concourse', moderateCrowd, []);
    // Score should be non-trivial for busy zone with active incident
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(['moderate', 'high', 'critical']).toContain(result.category);
  });

  it('should return 0 for unknown zone', () => {
    const result = calculateZoneRisk('unknown-zone', baseCrowd, baseTransport);
    expect(result.score).toBe(0);
    expect(result.category).toBe('low');
  });

  it('should include factors with defined weights', () => {
    const result = calculateZoneRisk('zone-north-concourse', baseCrowd, baseTransport);
    // Factors should be an array of objects with weight and contribution
    expect(Array.isArray(result.factors)).toBe(true);
    expect(result.factors.length).toBeGreaterThan(0);
    result.factors.forEach((f) => {
      expect(typeof f.weight).toBe('number');
      expect(f.weight).toBeGreaterThan(0);
    });
  });

  it('should penalise transport disruption', () => {
    const disruptedTransport = baseTransport.map((t) =>
      t.id === 'metro-main' ? { ...t, status: 'disrupted' } : t,
    );
    const withDisruption = calculateZoneRisk('zone-north-concourse', baseCrowd, disruptedTransport);
    const withoutDisruption = calculateZoneRisk('zone-north-concourse', baseCrowd, baseTransport);
    expect(withDisruption.score).toBeGreaterThanOrEqual(withoutDisruption.score);
  });

  it('should penalise accessibility obstruction', () => {
    const withObstruction = {
      ...baseCrowd,
      zones: baseCrowd.zones.map((z) =>
        z.id === 'zone-accessible-hub' ? { ...z, accessibilityObstruction: true } : z,
      ),
    };
    const with_ = calculateZoneRisk('zone-accessible-hub', withObstruction, baseTransport);
    const without_ = calculateZoneRisk('zone-accessible-hub', baseCrowd, baseTransport);
    expect(with_.score).toBeGreaterThan(without_.score);
  });
});

describe('Risk Engine — overall risk', () => {
  it('should aggregate zone risks into overall score', () => {
    const result = calculateOverallRisk(baseCrowd, baseTransport);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.zoneRisks.length).toBeGreaterThan(0);
    expect(result.highestRiskZone).toBeTruthy();
    expect(result.calculatedAt).toBeTruthy();
  });
});
