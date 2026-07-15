import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// #What — Simple dummy React component to check test setup compatibility.
function DummyComponent() {
  return (
    <div>
      <a href="#main" className="skip-link">Skip to main content</a>
      <main id="main">Accessible Content</main>
    </div>
  );
}

describe('Accessibility tests', () => {
  it('should render skip to main content link', () => {
    // #What — Simple test assertions using standard DOM querying.
    render(<DummyComponent />);
    const link = screen.getByText('Skip to main content');
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('#main');
  });
});
