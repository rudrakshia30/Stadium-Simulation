# CrowdSphere AI — Architecture & Design

## Overview

CrowdSphere AI uses a **hybrid intelligence architecture** that separates deterministic computation from generative AI. Every operational fact originates from deterministic algorithms and structured data. Gemini is responsible exclusively for understanding, explaining, translating, and prioritising — never for calculating facts.

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        Browser (React/Vite)                        │
│  Fan Companion │ Operations Command Center │ Supporting Pages       │
│                                                                    │
│  ┌─────────────────────┐  ┌──────────────────────────────────────┐ │
│  │  Deterministic UI   │  │         Gemini-Powered UI            │ │
│  │  - Route display    │  │  - Chat panel                        │ │
│  │  - Map rendering    │  │  - Operations brief                  │ │
│  │  - Facility search  │  │  - Announcement generator            │ │
│  │  - Risk cards       │  │  - Multilingual output               │ │
│  └─────────────────────┘  └──────────────────────────────────────┘ │
└───────────────────────────────┬────────────────────────────────────┘
                                │ HTTPS / fetch (JSON only)
                                │ No secrets in browser
┌───────────────────────────────▼────────────────────────────────────┐
│                     Express API Server (Node.js 20)                │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Security Middleware                       │  │
│  │  Helmet │ CORS Allowlist │ Rate Limit │ JWT Auth │ Zod     │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────────────────────┐  ┌─────────────────────────────┐   │
│  │  Deterministic Engine    │  │   Gemini Orchestration       │   │
│  │                          │  │                              │   │
│  │  • Dijkstra routing      │  │  • fanAssistantService       │   │
│  │  • Priority queue        │  │  • operationsBriefService    │   │
│  │  • Risk scoring          │  │  • announcementService       │   │
│  │  • Facility finder       │  │  • Tool declarations         │   │
│  │  • Transport advisor     │  │  • Response validation       │   │
│  │  • Volunteer tracker     │  │  • Hallucination guards      │   │
│  │  • Incident playbook     │  │  • Max 3 tool rounds         │   │
│  │  • Route cache (LRU)     │  │  • Safe fallback             │   │
│  └──────────────────────────┘  └──────────┬──────────────────┘   │
│                                            │                       │
└────────────────────────────────────────────┼───────────────────────┘
                                             │ HTTPS (backend only)
                                             │ API key never in browser
┌────────────────────────────────────────────▼───────────────────────┐
│                      Gemini 2.5 Flash (Google AI)                  │
│                                                                    │
│  Receives: compact operational context (NOT full dataset)          │
│  Uses: function calling to request deterministic tools             │
│  Returns: structured JSON (validated by Zod before delivery)       │
└────────────────────────────────────────────────────────────────────┘
```

---

## Deterministic Tools

| Tool | Purpose | Algorithm |
|------|---------|-----------|
| `getVenueRoute` | Standard shortest route | Dijkstra with priority queue |
| `getAccessibleRoute` | Wheelchair/step-free route | Dijkstra with edge filtering |
| `getFacilityLocations` | Find facilities by type | Array filter + sort |
| `getZoneStatus` | Zone crowd data | Direct lookup |
| `getTransportOptions` | Transport recommendations | Filter + sort by preference |
| `getCurrentOperationsSnapshot` | Operational snapshot | Aggregation of current state |
| `calculateZoneRisk` | 0–100 risk score | Weighted formula |
| `getIncidentPlaybook` | Response procedures | Static playbook lookup |
| `getVolunteerAvailability` | Volunteer counts | Direct lookup |
| `compareResponseOptions` | Response trade-offs | Comparative analysis |

---

## Routing Algorithm

```
Dijkstra's Algorithm
  Input: source node, destination node, options
  Graph: Unity Arena adjacency list
  
  Cost function:
    base_cost = edge.distance_meters
    crowd_multiplier = {low: 1.0, moderate: 1.3, high: 1.8, critical: 2.5}
    queue_penalty = queue_minutes × 60
    elevator_outage = Infinity (if elevator required but unavailable)
    closed_edge = Infinity
    
    edge_cost = base_cost × crowd_multiplier + queue_penalty
    
  Filters:
    wheelchair=true → exclude non-accessible edges
    stepFree=true   → exclude non-step-free edges
    avoidStairs     → large penalty on stair edges
    
  Output: RouteResult with routeId, nodes, steps, distance, time,
          accessibilityStatus, avoidedZones, warnings, verified=true
```

---

## Risk Scoring Formula

```
Risk Score (0–100) = Σ (factor_value × weight)

Factors:
  occupancy_pct     weight=0.30  → value 0–100
  queue_minutes     weight=0.20  → capped at 30 min → value 0–100
  movement_conflict weight=0.15  → 0 or 100
  incident_severity weight=0.20  → none=0, low=25, moderate=50, high=75, critical=100
  access_obstruction weight=0.10 → 0 or 100
  transport_disruption weight=0.05 → 0 or 100

Categories:
  0–24   → Low
  25–49  → Moderate
  50–74  → High
  75–100 → Critical
```

---

## Gemini Function-Calling Flow

```
1. User sends message to /api/fan/chat
2. Zod validates request (length, language enum, preference fields)
3. fanAssistantService builds compact context object
   (ONLY current scenario zone summary + user preferences)
   (NOT the entire venue dataset)
4. Send to Gemini with:
   - System instruction (with 15 hallucination protection rules)
   - Tool declarations for all 10 deterministic tools
   - User message
5. Gemini returns functionCall request(s)
6. Backend validates tool name against TOOL_REGISTRY allowlist
7. Backend validates arguments with Zod schema
8. Backend executes deterministic tool (no Gemini involvement)
9. Tool result returned to Gemini as functionResponse
10. Repeat up to 3 rounds maximum
11. Gemini produces final JSON answer
12. Zod validates final answer against fanResponseSchema
13. If invalid: retry once with schema-repair prompt
14. If still invalid: return safe hardcoded fallback
15. Validated response sent to browser
```

---

## Security Trust Boundaries

```
TRUST BOUNDARY 1: Browser → Server
  - All inputs validated with Zod
  - No secrets cross this boundary (browser → server direction)
  - JWT cookie is HttpOnly (browser cannot read it)
  - JSON size limited to 10 KB

TRUST BOUNDARY 2: Server → Gemini
  - Compact context only (not full dataset)
  - API key is backend environment variable only
  - Gemini output treated as untrusted
  - All Gemini output validated before use

TRUST BOUNDARY 3: Gemini → Tools
  - Tool names validated against hard allowlist
  - Tool arguments validated with Zod
  - Tools execute deterministically (Gemini cannot influence results)
  - Maximum 3 tool-calling rounds

UNTRUSTED ZONE: User input
  - May contain prompt injection attempts
  - System instruction instructs Gemini to ignore injections
  - Never rendered as HTML (React escapes by default)
  - Never executed as code
```

---

## Data Architecture

All data is simulated and in-memory. No database is used.

```
server/src/data/
  venue.js          → Static Unity Arena venue definition
  crowd.js          → Baseline crowd state factory
  transport.js      → Baseline transport state factory
  scenarios.js      → 10 simulation scenarios
  operationsState.js → In-memory singleton (current active scenario)
```

---

## Multilingual Architecture

```
Languages: English (en), Hindi (hi), Spanish (es), French (fr), Arabic (ar)

Client side:
  - Static dictionaries in client/src/i18n/
  - LanguageContext provides t(key) translation function
  - Language selection updates document.lang and document.dir
  - Arabic: dir="rtl", layout mirrors, icons reposition

Server side (Gemini):
  - Language preference sent in each request
  - System instruction: "respond in the requested language"
  - Gemini translates explanations and announcements
  - Backend validates language field against allowed enum
```

---

## Offline Architecture

```
Service Worker Strategy:
  - Cache-first for app shell (HTML, CSS, JS)
  - Network-first for API calls
  - Offline fallback for /api/venue and /api/health
  - No caching of /api/fan/chat or /api/ops/ (sensitive)

Offline capabilities:
  ✓ Deterministic route generation
  ✓ Facility search
  ✓ Static emergency guidance
  ✓ Venue map display
  ✓ Static transport information (marked as stale)
  
  ✗ Gemini AI responses (network required)
  ✗ Live crowd data
  ✗ Operations command centre
```

---

## Demo vs Production

| Feature | Demo (this prototype) | Production |
|---------|----------------------|------------|
| Data | Simulated JSON | Real venue API |
| Database | In-memory object | PostgreSQL/Redis |
| Auth | Simple access code | OAuth2/SSO |
| Rate limiting | In-memory | Redis |
| Scaling | Single process | Kubernetes |
| TLS | Proxy/manual | Load balancer |
| Monitoring | Console logs | Datadog/CloudWatch |
| Gemini key | `.env` file | Secret manager |
