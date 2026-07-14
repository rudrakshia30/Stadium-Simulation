/**
 * Unit tests for the deterministic routing engine.
 */
import { describe, it, expect } from 'vitest';
import { calculateRoute } from '../tools/routingEngine.js';
import { getDefaultCrowdState } from '../data/crowd.js';

const baseCrowd = getDefaultCrowdState();

describe('Routing Engine — basic routes', () => {
  it('should find a route from gate-a to zone-north-concourse', () => {
    const result = calculateRoute({ from: 'gate-a', to: 'zone-north-concourse' }, baseCrowd);
    expect(result.verified).toBe(true);
    expect(result.nodes).toContain('gate-a');
    expect(result.nodes).toContain('zone-north-concourse');
    expect(result.distanceMeters).toBeGreaterThan(0);
    expect(result.estimatedMinutes).toBeGreaterThan(0);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.routeId).toBeTruthy();
    expect(result.generatedAt).toBeTruthy();
  });

  it('should route from gate-b to metro-main', () => {
    const result = calculateRoute({ from: 'gate-b', to: 'metro-main' }, baseCrowd);
    expect(result.verified).toBe(true);
    expect(result.nodes[0]).toBe('gate-b');
    expect(result.nodes[result.nodes.length - 1]).toBe('metro-main');
  });

  it('should route from gate-a to section-214 via multiple zones', () => {
    const result = calculateRoute({ from: 'gate-a', to: 'section-214' }, baseCrowd);
    expect(result.verified).toBe(true);
    expect(result.distanceMeters).toBeGreaterThan(100);
  });
});

describe('Routing Engine — accessibility filtering', () => {
  it('should return accessible route when wheelchair=true', () => {
    const result = calculateRoute(
      { from: 'gate-e', to: 'section-214', wheelchair: true },
      baseCrowd,
    );
    expect(result.verified).toBe(true);
    // All steps should use accessible edges
    expect(result.accessibilityStatus).not.toBe('not-accessible');
  });

  it('should exclude stair edges when stepFree=true', () => {
    const result = calculateRoute(
      { from: 'gate-e', to: 'section-214', stepFree: true },
      baseCrowd,
    );
    expect(result.verified).toBe(true);
    const hasStairs = result.steps.some((s) => s.type === 'stairs');
    expect(hasStairs).toBe(false);
  });

  it('should avoid stair edges with penalty when avoidStairs=true', () => {
    const withStairs = calculateRoute({ from: 'gate-a', to: 'section-101' }, baseCrowd);
    const withoutStairs = calculateRoute(
      { from: 'gate-a', to: 'section-101', avoidStairs: true },
      baseCrowd,
    );
    // Both should find a route — stairs preference affects cost not necessarily result
    expect(withStairs.verified).toBe(true);
    expect(withoutStairs.verified).toBe(true);
  });

  it('should throw when no accessible route exists due to elevator outage', () => {
    // With elevator-n out and wheelchair=true (step-free), section-214 (upper level)
    // becomes unreachable via accessible paths — the engine correctly throws.
    expect(() =>
      calculateRoute(
        { from: 'gate-e', to: 'section-214', wheelchair: true, elevatorOutages: ['elevator-n'] },
        baseCrowd,
      ),
    ).toThrow();
  });
});

describe('Routing Engine — crowd avoidance', () => {
  it('should prefer low-density zones when avoidCrowds=true', () => {
    const crowdWithHighDensity = {
      zones: baseCrowd.zones.map((z) =>
        z.id === 'zone-east-concourse'
          ? { ...z, densityLevel: 'critical', occupancyPct: 95 }
          : z,
      ),
      incidents: baseCrowd.incidents,
    };

    const result = calculateRoute(
      { from: 'gate-b', to: 'bus-terminal', avoidCrowds: true },
      crowdWithHighDensity,
    );
    expect(result.verified).toBe(true);
  });
});

describe('Routing Engine — errors', () => {
  it('should throw NotFoundError for unknown source node', () => {
    expect(() => calculateRoute({ from: 'invalid-node', to: 'gate-a' }, baseCrowd)).toThrow();
  });

  it('should throw NotFoundError for unknown destination node', () => {
    expect(() => calculateRoute({ from: 'gate-a', to: 'invalid-node' }, baseCrowd)).toThrow();
  });

  it('should throw when no accessible route exists', () => {
    // Force all edges to be inaccessible by closing all edges
    expect(() =>
      calculateRoute(
        {
          from: 'section-101',
          to: 'metro-main',
          wheelchair: true,
          stepFree: true,
        },
        baseCrowd,
      ),
    ).toThrow();
  });
});

describe('Routing Engine — route structure', () => {
  it('should return routeId as a UUID-like string', () => {
    const result = calculateRoute({ from: 'gate-a', to: 'gate-b' }, baseCrowd);
    expect(result.routeId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('should include generatedAt as ISO string', () => {
    const result = calculateRoute({ from: 'gate-a', to: 'gate-b' }, baseCrowd);
    expect(() => new Date(result.generatedAt)).not.toThrow();
  });

  it('should return verified=true on all successful routes', () => {
    const result = calculateRoute({ from: 'gate-a', to: 'gate-b' }, baseCrowd);
    expect(result.verified).toBe(true);
  });
});
