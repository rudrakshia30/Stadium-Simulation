/**
 * Unit tests for the RouteCache.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RouteCache } from '../tools/routeCache.js';

describe('RouteCache', () => {
  let cache;

  beforeEach(() => {
    cache = new RouteCache({ maxSize: 3, ttlMs: 500 });
  });

  it('should return undefined on cache miss', () => {
    expect(cache.get('key-1')).toBeUndefined();
  });

  it('should store and retrieve a value', () => {
    cache.set('key-1', { routeId: 'abc' });
    expect(cache.get('key-1')).toEqual({ routeId: 'abc' });
  });

  it('should track size correctly', () => {
    expect(cache.size).toBe(0);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.size).toBe(2);
  });

  it('should expire entries after TTL', async () => {
    cache = new RouteCache({ maxSize: 10, ttlMs: 50 });
    cache.set('key-1', 'value');
    expect(cache.get('key-1')).toBe('value');
    await new Promise((r) => setTimeout(r, 100));
    expect(cache.get('key-1')).toBeUndefined();
  });

  it('should evict oldest entry when at max capacity', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.set('d', 4); // Should evict 'a'
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('d')).toBe(4);
  });

  it('should clear all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get('a')).toBeUndefined();
  });

  it('should overwrite existing key', () => {
    cache.set('key', 'old');
    cache.set('key', 'new');
    expect(cache.get('key')).toBe('new');
  });
});
