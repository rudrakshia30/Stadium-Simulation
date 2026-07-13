# SECURITY.md — CrowdSphere AI

## Reporting Security Issues

If you discover a security vulnerability in this demonstration prototype, please report it responsibly.

**Do not open a public issue for security vulnerabilities.**

Send a detailed description to the project maintainers. Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

We will acknowledge receipt within 48 hours and aim to address confirmed vulnerabilities within 7 days.

---

## Security Architecture

CrowdSphere AI is a demonstration prototype. It implements security controls appropriate for a prototype that handles no real personal data.

### Secret Management

| Control | Implementation |
|---------|----------------|
| Gemini API key | Backend-only, never sent to browser |
| JWT secret | Environment variable, minimum 32 chars |
| Ops access code | Environment variable, constant-time comparison |
| `.env` file | In `.gitignore`, never committed |
| Logs | Secrets redacted before logging |
| Error responses | Safe messages only, no stack traces in production |

### HTTP Security (Helmet)

- `Content-Security-Policy` — restricts sources for scripts, styles, connections
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (in production)
- `Referrer-Policy: no-referrer`
- `X-XSS-Protection: 0` (modern CSP replaces this)

### Authentication

- Operations Command Center protected by JWT
- JWT stored in `HttpOnly`, `SameSite=Strict`, `Secure` (production) cookie
- JWT expiry: 15 minutes
- Login endpoint rate-limited: 10 requests per 15 minutes per IP
- Constant-time comparison for access code verification
- Logout clears cookie immediately

### Input Validation

Every API endpoint validates inputs with Zod:
- Message max length: 2,000 characters
- Conversation history max: 20 messages
- Language: enum allowlist only
- Scenario IDs: enum allowlist only
- Route node IDs: verified against venue graph
- Unknown fields rejected (`.strict()`)
- JSON body limit: 10 KB
- URL-encoded limit: 10 KB

### AI Security

- Gemini API key never exposed to client
- Prompt injection instructions in user messages are neutralised by system instruction
- Tool function names validated against a hard allowlist
- Tool arguments validated with Zod before execution
- Maximum 3 tool-calling rounds per request
- AI output validated with Zod before delivery to client
- Invalid AI output triggers one retry then safe fallback
- AI output never rendered as raw HTML
- No `dangerouslySetInnerHTML` anywhere in the codebase
- AI cannot execute arbitrary code or functions

### Privacy

- No personal data collected or stored
- No fan movement history recorded
- No biometric data processed
- No facial recognition
- No third-party analytics
- No cookies except the operations JWT cookie
- Simulation data only — all crowd data is fictional

### Application Security

- No `eval()` anywhere
- No dynamic `import()` from user input
- No shell execution from user input
- No arbitrary file access
- No path traversal
- No SQL (no database)
- CORS restricted to configured origin

---

## Known Limitations (Prototype)

This is a demonstration prototype. In production:
- The in-memory operations state would use a proper database with access controls
- The JWT secret would be rotated regularly
- The access code would be replaced by a proper identity provider
- Rate limiting would use a distributed store (e.g., Redis)
- Full audit logging would be implemented
- TLS would be enforced at the infrastructure level
- A Web Application Firewall would provide additional protection

---

## Disclaimer

CrowdSphere AI is an independent demonstration prototype using simulated venue data.
It is not affiliated with or endorsed by FIFA.
No real operational data, personal data, or official venue information is used.
