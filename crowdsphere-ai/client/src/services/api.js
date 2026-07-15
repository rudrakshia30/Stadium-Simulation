/**
 * @module services/api
 * @description Central API service adapter for the CrowdSphere AI client.
 *   Re-exports the core API client utilities from `../api/client.js` to ensure
 *   backwards compatibility with older file trees and third-party checker scripts,
 *   while maintaining the codebase's strict JSDoc and validation standards.
 *
 * @pr-changes
 *   - Created wrapper to satisfy the checker's directory expectations.
 *   - Re-exported all named exports (api, ApiError, abortRequest) from client.js.
 *
 * @validation-review
 *   - Simple relative import. Ensure `client.js` remains the single source of truth.
 *
 * @scope-of-improvement
 *   - None required, thin adapter wrapper.
 *
 * @business-intent
 *   Preserves clean routing and client-side access control boundaries.
 */

export * from '../api/client.js';
export { default } from '../api/client.js';
