# CrowdSphere AI — Test Strategy

This document describes the testing strategy implemented in CrowdSphere AI to verify correctness, reliability, security, and accessibility across all modules.

## 🧪 Test Matrix

### 1. Unit Testing
*   **Priority Queue**: Checks push/pop ordering, heap balance invariants, and empty-queue stability.
*   **Route Cache**: Validates LRU eviction sequence, TTL expiration, and clear operations.

### 2. Algorithmic Testing
*   **Dijkstra Cost Model**: Tests crowd occupancy multipliers, gate queue penalties, and offline elevator/closed edge bypass routes.
*   **Weighted Risk Engine**: Verifies correct zone risk ratings (low, moderate, high, critical) across different scenario triggers.

### 3. Integration Testing
*   **API Pipeline**: Tests authentication cookies, rate limits, schema validation gates, and global error translations.
*   **AI Service Mocking**: Exercises the complete multi-round tool-calling loop using simulated Gemini responses to ensure robustness without depending on external AI services.
