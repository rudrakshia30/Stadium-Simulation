/**
 * @module tools/routeCache
 * @description Bounded in-memory LRU-style cache with per-entry TTL expiry.
 *   Used to avoid redundant Dijkstra computations for identical route requests
 *   within the same crowd-state snapshot. Eviction follows two strategies:
 *   (1) expired entries are removed lazily on every set() call, and (2) the
 *   oldest (first-inserted) entry is evicted when the cache is at capacity.
 *   The Map insertion-order property is exploited to implement LRU ordering
 *   cheaply — delete-then-set moves an entry to the "most recent" position.
 *
 * @pr-changes Initial implementation. TTL check on get() performs lazy eviction
 *   of the queried entry. _evictExpired() added to batch-clean before each set()
 *   to prevent stale entries consuming capacity. LRU re-insertion on get() added
 *   to promote recently accessed entries.
 *
 * @validation-review
 *   - TTL is set at construction and applied uniformly to all entries; there is
 *     no per-entry TTL override. Route cache TTL should be shorter than the
 *     crowd-state snapshot update interval to prevent serving outdated routes.
 *   - maxSize is enforced only at set() time, not at construction; there is no
 *     validation that maxSize > 0. Callers must pass a positive integer.
 *   - Keys are plain strings — callers must ensure key uniqueness and length.
 *   - _evictExpired() iterates the full store; for very large maxSize values this
 *     could be slow. Current usage with small venue graphs poses no risk.
 *   - No persistence — cache is lost on server restart; this is intentional.
 *
 * @scope-of-improvement
 *   - Add a peek() method that checks cache without updating LRU order, useful
 *     for cache telemetry and hit-rate monitoring.
 *   - Expose cache hit/miss metrics via a getStats() method for observability.
 *   - Consider replacing Map-based LRU with a doubly-linked list + Map for true
 *     O(1) LRU operations if cache size grows significantly.
 *   - TTL could be configurable per-entry (e.g. shorter TTL for
 *     accessibility-sensitive routes when elevators are fluctuating).
 *
 * @business-intent Route computation via Dijkstra is synchronous CPU work.
 *   Caching identical requests (same from/to/preferences/snapshot) reduces
 *   server load during high-demand periods (e.g. half-time when thousands of
 *   fans simultaneously request routes to concessions). Bounded size prevents
 *   memory exhaustion in long-running server processes.
 */

/**
 * A bounded in-memory cache with TTL expiry and LRU eviction.
 *
 * @description Stores arbitrary key-value pairs with automatic expiry based on
 *   a TTL configured at construction time. When the cache reaches maxSize, the
 *   oldest entry (by insertion/access order) is evicted to make room. Designed
 *   for short-lived route caching where staleness beyond TTL is unacceptable.
 */
export class RouteCache {
  /**
   * Construct a new RouteCache with size and TTL bounds.
   *
   * @param {Object} options - Cache configuration.
   * @param {number} options.maxSize - Maximum number of entries before LRU eviction.
   *   Must be a positive integer.
   * @param {number} options.ttlMs - Time-to-live in milliseconds. Entries older
   *   than this are considered expired and will be evicted or skipped on retrieval.
   *
   * @business-intent TTL should be aligned with the crowd-state snapshot refresh
   *   interval (e.g. if snapshots update every 30 seconds, TTL should be ≤ 30 000 ms)
   *   to prevent routing fans through crowd conditions that no longer reflect reality.
   */
  constructor({ maxSize, ttlMs }) {
    // #What — store size and TTL for use in set() and get() respectively
    this._maxSize = maxSize;
    this._ttlMs = ttlMs;

    /**
     * Internal Map used as an ordered key-value store.
     * Map maintains insertion order, which is exploited for LRU ordering:
     * the first key in iteration order is the "oldest" (least recently used).
     * @type {Map<string, {value: any, expiresAt: number}>}
     */
    this._store = new Map();
  }

  /**
   * Current number of entries in the cache (including potentially expired ones).
   * @returns {number}
   */
  get size() {
    // #What — includes entries that may have expired but not yet been evicted
    return this._store.size;
  }

  /**
   * Retrieve a cached value by key.
   *
   * @description Returns the stored value if the key exists AND the entry has not
   *   expired. Expired entries are deleted lazily on access. Valid entries are
   *   re-inserted (delete + set) to promote them to the "most recently used"
   *   position in the Map's iteration order, implementing LRU semantics.
   *
   * @param {string} key - Cache key.
   * @returns {any | undefined} The cached value, or undefined if missing or expired.
   *
   * @business-intent Cache misses cause a fresh Dijkstra computation — this is
   *   safe and correct. Cache hits avoid redundant CPU work and reduce latency
   *   for repeat route requests during busy periods.
   */
  get(key) {
    const entry = this._store.get(key);
    // #What — return undefined immediately if key not present
    if (!entry) return undefined;

    // #What — check TTL expiry; delete and return undefined if expired
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return undefined;
    }

    // #What — LRU promotion: delete and re-set moves entry to the end (most-recently-used)
    this._store.delete(key);
    this._store.set(key, entry);
    return entry.value;
  }

  /**
   * Store a value in the cache under the given key.
   *
   * @description Evicts all currently-expired entries first, then evicts the
   *   oldest entry if the cache is at capacity, before inserting the new entry
   *   with a TTL-based expiry timestamp.
   *
   * @param {string} key - Cache key. Existing entries with the same key are overwritten.
   * @param {any} value - Value to cache. May be any serialisable value.
   *
   * @risk-area If maxSize is set too high and TTL too long, the cache can hold
   *   many stale routes that are never served (get() will miss them) but still
   *   consume memory. _evictExpired() on each set() mitigates this.
   */
  set(key, value) {
    // #What — clean up expired entries before checking capacity to maximise effective space
    this._evictExpired();

    // #What — LRU eviction: remove the first Map entry (oldest by insertion/access order)
    if (this._store.size >= this._maxSize) {
      const oldestKey = this._store.keys().next().value;
      // #Uncertain — if all entries were promoted recently, the "oldest" may still be relatively fresh
      if (oldestKey !== undefined) this._store.delete(oldestKey);
    }

    // #What — store value with an absolute expiry timestamp (now + TTL)
    this._store.set(key, {
      value,
      expiresAt: Date.now() + this._ttlMs,
    });
  }

  /**
   * Clear all entries from the cache immediately.
   *
   * @description Removes every entry regardless of TTL. Useful after a scenario
   *   change when all previously cached routes may be invalid due to changed
   *   crowd state or venue conditions.
   *
   * @business-intent Should be called whenever the operations state (scenario,
   *   crowd snapshot, elevator outages) changes to prevent stale routes being
   *   served to fans.
   */
  clear() {
    // #What — delegates to Map.clear() for O(1) full eviction
    this._store.clear();
  }

  /**
   * Remove all entries from the store that have passed their TTL expiry.
   *
   * @description Called internally before each set() to reclaim capacity from
   *   expired entries before LRU eviction is considered. This is a lazy
   *   clean-up strategy — expired entries may persist until the next set() call.
   *
   * @private
   *
   * @validation-note This iterates the full store on every set() call. For large
   *   maxSize values this becomes O(n). Consider a scheduled periodic sweep if
   *   maxSize grows to thousands of entries.
   */
  _evictExpired() {
    const now = Date.now();
    // #What — iterate all entries and delete those past their expiry timestamp
    for (const [key, entry] of this._store.entries()) {
      if (now > entry.expiresAt) this._store.delete(key);
    }
  }
}
