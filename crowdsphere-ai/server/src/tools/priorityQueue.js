/**
 * Min-heap priority queue for Dijkstra's algorithm.
 * Stores items sorted by ascending priority (cost).
 *
 * @module tools/priorityQueue
 */

/**
 * A min-heap priority queue.
 * @template T
 */
export class PriorityQueue {
  constructor() {
    /** @type {Array<{item: T, priority: number}>} */
    this._heap = [];
  }

  /** @returns {number} */
  get size() {
    return this._heap.length;
  }

  /** @returns {boolean} */
  isEmpty() {
    return this._heap.length === 0;
  }

  /**
   * Insert an item with a given priority.
   * @param {T} item
   * @param {number} priority
   */
  push(item, priority) {
    this._heap.push({ item, priority });
    this._bubbleUp(this._heap.length - 1);
  }

  /**
   * Remove and return the item with the lowest priority.
   * @returns {T | undefined}
   */
  pop() {
    if (this._heap.length === 0) return undefined;
    const top = this._heap[0].item;
    const last = this._heap.pop();
    if (this._heap.length > 0 && last !== undefined) {
      this._heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  /**
   * @private
   * @param {number} i
   */
  _bubbleUp(i) {
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (this._heap[parent].priority <= this._heap[i].priority) break;
      [this._heap[parent], this._heap[i]] = [this._heap[i], this._heap[parent]];
      i = parent;
    }
  }

  /**
   * @private
   * @param {number} i
   */
  _sinkDown(i) {
    const n = this._heap.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this._heap[left].priority < this._heap[smallest].priority) smallest = left;
      if (right < n && this._heap[right].priority < this._heap[smallest].priority) smallest = right;
      if (smallest === i) break;
      [this._heap[smallest], this._heap[i]] = [this._heap[i], this._heap[smallest]];
      i = smallest;
    }
  }
}
