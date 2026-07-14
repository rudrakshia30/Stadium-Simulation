/**
 * In-memory LRU-style route cache with TTL.
 * Bounded by maxSize to prevent memory growth.
 *
 * @module tools/routeCache
 */

/**
 * A bounded in-memory cache with TTL expiry.
 */
export class RouteCache {
  /**
   * @param {Object} options
   * @param {number} options.maxSize - Maximum number of entries
   * @param {number} options.ttlMs - Time-to-live in milliseconds
   */
  constructor({ maxSize, ttlMs }) {
    this._maxSize = maxSize;
    this._ttlMs = ttlMs;
    /** @type {Map<string, {value: any, expiresAt: number}>} */
    this._store = new Map();
  }

  /** @returns {number} */
  get size() {
    return this._store.size;
  }

  /**
   * Get a cached value. Returns undefined if missing or expired.
   * @param {string} key
   * @returns {any | undefined}
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }

    // Move to end for LRU ordering
    this._store.delete(key);
    this._store.set(key, entry);
    return entry.value;
  }

  /**
   * Store a value with TTL.
   * Evicts the oldest entry if the cache is full.
   * @param {string} key
   * @param {any} value
   */
  set(key, value) {
    // Evict expired entries first
    this._evictExpired();

    // Evict oldest entry if at capacity
    if (this._store.size >= this._maxSize) {
      const oldestKey = this._store.keys().next().value;
      if (oldestKey !== undefined) this._store.delete(oldestKey);
    }

    this._store.set(key, {
      value,
      expiresAt: Date.now() + this._ttlMs,
    });
  }

  /**
   * Clear all entries.
   */
  clear() {
    this._store.clear();
  }

  /**
   * Remove expired entries.
   * @private
   */
  _evictExpired() {
    const now = Date.now();
    for (const [key, entry] of this._store.entries()) {
      if (now > entry.expiresAt) this._store.delete(key);
    }
  }
}
