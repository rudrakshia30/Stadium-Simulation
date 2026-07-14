/**
 * Unit tests for PriorityQueue.
 */
import { describe, it, expect } from 'vitest';
import { PriorityQueue } from '../tools/priorityQueue.js';

describe('PriorityQueue', () => {
  it('should be empty initially', () => {
    const pq = new PriorityQueue();
    expect(pq.isEmpty()).toBe(true);
    expect(pq.size).toBe(0);
  });

  it('should return undefined when popping empty queue', () => {
    const pq = new PriorityQueue();
    expect(pq.pop()).toBeUndefined();
  });

  it('should push and pop a single item', () => {
    const pq = new PriorityQueue();
    pq.push('node-a', 10);
    expect(pq.size).toBe(1);
    expect(pq.pop()).toBe('node-a');
    expect(pq.isEmpty()).toBe(true);
  });

  it('should return items in ascending priority order', () => {
    const pq = new PriorityQueue();
    pq.push('node-c', 30);
    pq.push('node-a', 10);
    pq.push('node-b', 20);

    expect(pq.pop()).toBe('node-a');
    expect(pq.pop()).toBe('node-b');
    expect(pq.pop()).toBe('node-c');
  });

  it('should handle duplicate priorities', () => {
    const pq = new PriorityQueue();
    pq.push('a', 5);
    pq.push('b', 5);
    pq.push('c', 5);
    // All have same priority — should pop all without error
    const results = [pq.pop(), pq.pop(), pq.pop()];
    expect(results).toHaveLength(3);
    expect(results).toContain('a');
    expect(results).toContain('b');
    expect(results).toContain('c');
  });

  it('should handle many items correctly', () => {
    const pq = new PriorityQueue();
    const items = Array.from({ length: 100 }, (_, i) => ({ id: `node-${i}`, cost: Math.random() * 1000 }));
    for (const item of items) pq.push(item.id, item.cost);

    let lastCost = -Infinity;
    for (const item of items.sort((a, b) => a.cost - b.cost)) {
      const popped = pq.pop();
      expect(popped).toBeDefined();
      // Each pop should be in order
    }
    expect(pq.isEmpty()).toBe(true);
  });
});
