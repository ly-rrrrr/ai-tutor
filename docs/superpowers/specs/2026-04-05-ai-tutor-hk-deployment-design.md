# AI Tutor Hong Kong Deployment Design

**Date:** 2026-04-05

## Goal

Move the current AI Tutor project from "local demo that can build and run" to "publicly accessible trial product" with the lowest reasonable operational complexity and no extra paid infrastructure beyond the application server, domain, AI API usage, object storage, and transactional email.

## Product Scope

This release targets:

- Public web access over HTTPS
- Email-based magic link sign-in for unknown users
- Text chat with the AI tutor
- Voice upload, speech-to-text, AI reply, and text-to-speech playback
- Conversation persistence in MySQL
- Minimal abuse protection suitable for a free trial product

This release explicitly does not target:

- Mainland China ICP filing
- Native app distribution
- SMS, WeChat, Google, or password login
- Paid subscriptions or billing
- Redis, CDN, WAF, external monitoring, or managed backups
- Multi-region, high availability, or disaster recovery

## Constraints

- Primary goal is to get the product online quickly, not to maximize mainland access quality.
- The service may be used by unknown public users, so core auth and AI endpoints cannot remain in "demo mode".
- MySQL should run on the same server as the application.
- Cloud services should come from mature, well-known providers.
- The LLM provider must be callable through an API gateway compatible with OpenAI-style requests.
- Extra recurring cost should be minimized.

## Chosen Architecture

### Hosting

- Region: Hong Kong
- Server type: Tencent Cloud Lighthouse
- Recommended starter size: 2 vCPU / 4 GB RAM
- OS: Ubuntu 24.04 LTS

### Runtime Topology

The application runs as a single-server Docker Compose stack:

- `app`: the current Node.js/Express application, serving both API and built frontend
- `mysql`: MySQL 8 container with a persistent host volume
- `caddy`: reverse proxy, HTTPS termination, automatic certificate management

### Public Endpoints

- Application domain: `app.<your-domain>`
- HTTPS handled by Caddy
- Caddy proxies traffic to the application container on port `3000`
- MySQL is not exposed publicly

## Cloud Service Selection

### AI Gateway

- Provider: AiHubMix
- Access style: OpenAI-compatible HTTP API
- Base URL: `https://aihubmix.com/v1`

Planned model mapping:

- Chat model: `gemini-2.5-flash-lite`
- STT model: AiHubMix-provided speech-to-text model exposed through its OpenAI-compatible endpoint
- TTS model: AiHubMix-provided text-to-speech model exposed through its compatible endpoint

Reasoning:

- Existing code is already structured around OpenAI-style request payloads.
- Swapping to an OpenAI-compatible gateway is materially less risky than rewriting the AI stack around provider-specific SDKs.
- AiHubMix gives model flexibility without changing application-level interfaces.

### Object Storage

- Provider: Tencent Cloud COS
- Access style: S3-compatible API
- Bucket policy: private

Reasoning:

- The existing storage layer already uses the AWS S3 client abstraction.
- COS can be integrated by switching endpoint and credential configuration, which keeps the write scope small.
- Private buckets plus signed URLs are enough for trial-stage audio storage.

### Transactional Email

- Provider: Tencent Cloud SES
- Access style: SMTP
- Use case: magic link sign-in only

Reasoning:

- SMTP is a better fit than a template-only mail API for dynamic magic link emails.
- This keeps the auth email path simple and removes the current hard dependency on Resend.

## Data Model and Storage Rules

### MySQL

MySQL becomes mandatory in production. The current fallback behavior for missing database connectivity is acceptable for local development only and must be disabled in production.

Persistent data stored in MySQL:

- users
- auth tables
- scenarios
- conversations
- messages
- learning records

### Audio Storage

User recordings and generated TTS audio are stored in COS.

Required design change:

- Do not persist signed URLs in the database
- Persist object keys instead
- Generate short-lived signed URLs only when playback or transcription needs them

Reasoning:

- The current implementation returns signed URLs with a one-hour expiration.
- Persisting those URLs makes historical audio playback fail after expiry.

## Application Changes Required

### 1. Provider-Neutral AI Configuration

Replace provider-specific OpenAI naming with deployment-neutral AI configuration:

- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_CHAT_MODEL`
- `AI_STT_MODEL`
- `AI_TTS_MODEL`

Implementation effect:

- `server/_core/llm.ts` must stop hardcoding `https://api.openai.com/v1/chat/completions`
- `server/_core/tts.ts` must stop hardcoding the OpenAI speech endpoint
- `server/_core/voiceTranscription.ts` must stop hardcoding the OpenAI transcription endpoint

### 2. SMTP Email Abstraction

Replace the current Resend-specific email module with a provider-neutral SMTP email layer.

New environment variables:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_EMAIL`

Implementation effect:

- Replace `server/_core/resend.ts` with a generic email sender module
- Update `server/_core/auth.ts` to validate the SMTP configuration, not Resend-specific keys
- Magic link email content stays unchanged

### 3. S3-Compatible Storage Configuration

Generalize the storage layer so it works for COS and other S3-compatible providers.

New environment variables:

- `S3_ENDPOINT`
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_PUBLIC_BASE_URL` optional

Implementation effect:

- `server/storage.ts` must stop assuming AWS-native defaults
- Signed URL generation remains supported
- Database-facing code stores object keys instead of signed URLs

### 4. Production Fail-Fast Rules

Production startup must fail when required services are missing or misconfigured.

Required production dependencies:

- MySQL
- AI gateway configuration
- SMTP configuration
- S3-compatible storage configuration
- `APP_ORIGIN` set to the real public HTTPS domain

Development behavior may continue to allow:

- mock scenarios
- in-memory fallback
- looser environment requirements

Production behavior must not allow:

- database fallback to memory
- auth startup without mail configuration
- app startup without AI provider configuration
- storage usage without configured bucket credentials

### 5. Public Trial Guardrails

No extra paid anti-abuse service will be added. The application must enforce low-cost in-process guardrails.

Required controls:

- IP-based rate limit for requesting login emails
- email-plus-IP cooldown for repeated magic link requests
- user-plus-IP rate limit for text chat
- user-plus-IP rate limit for voice upload and TTS requests
- daily trial quota for high-cost actions

Recommended initial limits:

- Magic link email: 5 per IP per hour, 3 per email per hour
- Chat sends: 60 per user per hour
- Voice uploads: 20 per user per hour
- TTS generations: 40 per user per hour

These limits are intentionally simple and stored in memory. They are not durable across restarts and are acceptable for the first public trial release.

### 6. Routing and Production Usability Fixes

The frontend currently uses `~/app/...` paths in several navigation points. Those must be corrected so production navigation is reliable under the chosen router setup.

Also required:

- add a plain HTTP health endpoint such as `/healthz`
- enable `trust proxy` in Express when running behind Caddy
- keep secure cookie behavior in production
- keep upload size limits explicit

## Deployment Layout

### Containers

`app`

- built from the project Dockerfile
- runs `NODE_ENV=production`
- listens on internal port `3000`
- receives all production environment variables

`mysql`

- MySQL 8
- persistent volume mounted from the host
- internal network only

`caddy`

- serves public HTTPS
- redirects HTTP to HTTPS
- proxies requests to `app:3000`

### Files to Add

- `docker-compose.yml`
- `Caddyfile`
- production environment template such as `.env.production.example`
- deployment guide for server setup and first release

### Migration Flow

Database migrations must run as part of first deployment and every schema change release.

Required rule:

- production deployment is not considered complete until migrations have run successfully against MySQL

## Security Posture for This Release

This release is intentionally minimal, but the following are still mandatory:

- HTTPS everywhere
- secure cookies in production
- SMTP credentials and AI keys stored only in server-side environment variables
- private object storage bucket
- no client-side exposure of secret keys
- no production fallback to mock persistence

This release intentionally accepts:

- single-server failure risk
- no external alerting
- no DDoS-grade protection
- local backup only

## Backup and Recovery

No paid backup product will be used.

Minimum acceptable backup process:

- run scheduled `mysqldump` on the server
- write dump files to a local backup directory on the same host
- operator manually copies backups off-host periodically

This is not a full disaster recovery design. It is only a low-cost safeguard against routine operator error.

## Rollout Sequence

1. Refactor the codebase for provider-neutral AI, SMTP email, and S3-compatible storage.
2. Remove production fallback behavior.
3. Fix route navigation defects and add `/healthz`.
4. Add Docker Compose, Caddy, and production environment templates.
5. Write a deployment guide for Tencent Cloud Hong Kong.
6. Run typecheck, tests, and production build locally.
7. Deploy to the server and run migrations.
8. Perform end-to-end smoke tests on the public domain.

## Acceptance Criteria

The release is considered deployable only when all items below are true:

- The built application starts in production with no missing required configuration.
- The public site loads over HTTPS.
- A new user can request a magic link email and successfully log in.
- A logged-in user can create a conversation.
- Text chat returns AI responses through AiHubMix.
- Voice upload succeeds.
- Speech-to-text succeeds.
- TTS generation and playback succeed.
- Conversation history persists across browser refresh and server restart.
- Audio playback for stored historical messages still works after more than one hour because object keys, not expiring URLs, are persisted.
- The production stack can be started from documented steps on a clean Hong Kong server.

## Non-Goals

The following are intentionally deferred:

- Mainland filing and mainland-region hosting
- Native app support
- Additional login methods
- Payment and subscription systems
- Redis
- CDN
- External observability stack
- Professional anti-abuse tooling
- Horizontal scaling

## Open Decisions Resolved in This Design

- Hosting region: Hong Kong
- Server model: single server
- Database location: same server as the app
- Auth mode: email magic link only
- AI provider interface: OpenAI-compatible gateway through AiHubMix
- Object storage: Tencent Cloud COS
- Email delivery: Tencent Cloud SES via SMTP
- Cost posture: lowest reasonable recurring cost, no extra managed infra

## Success Definition

Success for this phase means the product is no longer just locally runnable. It can be deployed by following a documented server procedure, accessed by unknown public users over HTTPS, and used end-to-end for sign-in, chat, voice interaction, and history persistence with acceptable reliability for an early free trial.
