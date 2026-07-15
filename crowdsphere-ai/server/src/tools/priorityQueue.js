/**
 * @module tools/priorityQueue
 * @description Binary min-heap priority queue used exclusively by the routing
 *   engine (routingEngine.js) to drive Dijkstra's shortest-path algorithm.
 *   Items are stored as `{ item, priority }` pairs and ordered so that the
 *   element with the lowest numeric priority is always at the root (index 0).
 *   Push and pop are both O(log n), making this suitable for graphs with
 *   thousands of nodes.
 *
 * @pr-changes Initial implementation as a generic class. Template parameter T
 *   documented in JSDoc. bubbleUp and sinkDown marked @private with index
 *   arithmetic documented. Pop handles the single-element edge case.
 *
 * @validation-review
 *   - No maximum size limit — for very large venue graphs or repeated pushes
 *     without pops the heap could grow unbounded. Current venue graph is small
 *     enough that this is not a practical risk.
 *   - The `last` item after pop() is checked for undefined before placement at
 *     root, correctly handling the one-element degenerate case.
 *   - Heap property is maintained by bubbleUp on push and sinkDown on pop;
 *     no external mutation of _heap is possible (conventionally — JS has no
 *     true private fields here).
 *   - Priority comparisons use strict less-than; equal priorities are stable
 *     (insertion order preserved for ties) which is acceptable for Dijkstra.
 *
 * @scope-of-improvement
 *   - Replace bracket-notation _heap with actual private class fields (#heap)
 *     once the Node.js version target is confirmed to support them.
 *   - A decrease-key operation would enable lazy deletion optimisation,
 *     reducing unnecessary processing of stale Dijkstra nodes.
 *   - Generic typing hints are JSDoc-only; could benefit from a .d.ts declaration
 *     file if the project adds TypeScript consumers.
 *
 * @business-intent This data structure is the performance foundation of the
 *   venue routing engine. Dijkstra's correctness and speed depend entirely on
 *   the heap maintaining its min-heap invariant. Any bug here propagates to
 *   incorrect or suboptimal fan navigation routes.
 */

/**
 * A binary min-heap priority queue.
 *
 * @description Items are stored internally as `{item, priority}` pairs.
 *   The heap property guarantees that the pair with the smallest `priority`
 *   value is always accessible at O(1) via pop() (after O(log n) restore).
 *   Designed as a generic class so it can be reused beyond routing if needed.
 *
 * @template T - The type of items stored in the queue.
 */
export class PriorityQueue {
  constructor() {
    /**
     * Internal heap array.
     * Index 0 is always the minimum-priority element.
     * Children of node at index i are at 2i+1 (left) and 2i+2 (right).
     * @type {Array<{item: T, priority: number}>}
     */
    this._heap = [];
  }

  /**
   * Current number of elements in the queue.
   * @returns {number}
   * @business-intent Allows callers to determine queue capacity without exposing
   *   the internal heap array.
   */
  get size() {
    return this._heap.length;
  }

  /**
   * Returns true when the queue contains no elements.
   *
   * @description Used as the loop termination condition in Dijkstra's algorithm.
   *
   * @returns {boolean} True if the queue is empty.
   */
  isEmpty() {
    // #What — heap length of 0 means no elements; Dijkstra exits when this returns true
    return this._heap.length === 0;
  }

  /**
   * Insert an item with a given numeric priority.
   *
   * @description Appends the new `{item, priority}` pair to the end of the heap
   *   array, then calls _bubbleUp to restore the min-heap property by swapping
   *   with parent nodes while the new node's priority is less than its parent's.
   *   Time complexity: O(log n).
   *
   * @param {T} item - The value to enqueue.
   * @param {number} priority - Lower values are dequeued first (min-heap).
   *
   * @business-intent In Dijkstra's algorithm, priority is the known cost to reach
   *   a node. Pushing with updated lower costs causes the heap to correctly
   *   surface the cheapest frontier node on each pop().
   */
  push(item, priority) {
    // #What — append to the end of the array (heap bottom), then restore the heap property
    this._heap.push({ item, priority });
    this._bubbleUp(this._heap.length - 1);
  }

  /**
   * Remove and return the item with the lowest priority value.
   *
   * @description Extracts the root (minimum) element, moves the last element to
   *   the root position to maintain array compactness, then calls _sinkDown to
   *   restore the heap property. Returns undefined for an empty queue.
   *   Time complexity: O(log n).
   *
   * @returns {T | undefined} The lowest-priority item, or undefined if empty.
   *
   * @business-intent Dijkstra calls pop() on every iteration to obtain the
   *   unvisited node with the smallest current cost — this is the core of the
   *   algorithm's greedy correctness guarantee.
   */
  pop() {
    // #What — guard against pop on empty heap
    if (this._heap.length === 0) return undefined;

    // #What — save the root (minimum) item to return at the end
    const top = this._heap[0].item;

    // #What — remove the last element to use as the new root (maintains compact array)
    const last = this._heap.pop();

    // #What — only replace root and sink down if heap still has elements after the pop
    if (this._heap.length > 0 && last !== undefined) {
      this._heap[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  /**
   * Restore the heap property upward from index i.
   *
   * @description Repeatedly compares the element at index i with its parent and
   *   swaps them if the child has lower priority, then moves up to the parent index.
   *   Terminates when the root is reached or the parent has lower-or-equal priority.
   *
   * @private
   * @param {number} i - Starting index (newly inserted element).
   */
  _bubbleUp(i) {
    while (i > 0) {
      // #What — parent of node at i is at floor((i-1)/2) in a zero-indexed binary heap
      const parent = Math.floor((i - 1) / 2);

      // #What — stop if heap property is satisfied (parent <= child)
      if (this._heap[parent].priority <= this._heap[i].priority) break;

      // #What — swap child and parent to restore min-heap order
      [this._heap[parent], this._heap[i]] = [this._heap[i], this._heap[parent]];
      i = parent;
    }
  }

  /**
   * Restore the heap property downward from index i.
   *
   * @description Compares the element at index i with its left and right children,
   *   swapping with the smallest child if that child has lower priority than i.
   *   Continues until i is a leaf or both children have higher-or-equal priority.
   *
   * @private
   * @param {number} i - Starting index (element placed at root after pop).
   */
  _sinkDown(i) {
    const n = this._heap.length;
    while (true) {
      let smallest = i;
      // #What — compute left and right child indices in zero-indexed binary heap
      const left = 2 * i + 1;
      const right = 2 * i + 2;

      // #What — check if left child exists and has a lower priority than current smallest
      if (left < n && this._heap[left].priority < this._heap[smallest].priority) smallest = left;

      // #What — check if right child exists and has a lower priority than current smallest
      if (right < n && this._heap[right].priority < this._heap[smallest].priority) smallest = right;

      // #What — if current node is already the smallest, heap property is restored; exit
      if (smallest === i) break;

      // #What — swap current node with the smaller child and continue sinking
      [this._heap[smallest], this._heap[i]] = [this._heap[i], this._heap[smallest]];
      i = smallest;
    }
  }
}
