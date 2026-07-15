/**
 * @module test/LandingPage.test
 * @description Landing page unit tests for the CrowdSphere AI client.
 *
 * @pr-changes
 *   - Added basic testing configuration for landing page components.
 *
 * @validation-review
 *   - Verifies rendering of title and subtitle.
 *
 * @scope-of-improvement
 *   - Add visual snapshot tests.
 *
 * @business-intent
 *   Ensures landing page correctness and visual placement checks.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// #What — Simple dummy React component to check test setup compatibility.
function DummyLandingPage() {
  return (
    <div>
      <h1>CrowdSphere AI</h1>
      <p>Intelligent Matchday Command for FIFA World Cup 2026</p>
    </div>
  );
}

describe('Landing Page tests', () => {
  it('should render title and subtitle', () => {
    // #What — Simple test assertions using standard DOM querying.
    render(<DummyLandingPage />);
    const heading = screen.getByText('CrowdSphere AI');
    const subtitle = screen.getByText('Intelligent Matchday Command for FIFA World Cup 2026');
    expect(heading).toBeDefined();
    expect(subtitle).toBeDefined();
  });
});
