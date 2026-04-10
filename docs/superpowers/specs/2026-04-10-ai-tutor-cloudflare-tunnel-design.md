# AI Tutor Cloudflare Tunnel Deployment Design

## Context

The current `ai-tutor` stack is already running locally with Docker:

- `app` serves the application on internal port `3000`
- `mysql` persists data on the host
- `caddy` reverse-proxies HTTP traffic to `app`

The remaining production blocker is network topology, not application code:

- The host is an Ubuntu machine on a campus network
- The host only has a private IPv4 address on `eno1`
- Public IPv4 traffic does not reach the machine on ports `80/443`
- ACME HTTP/TLS challenges to the apparent public IPv4 fail with `Connection refused`

This means conventional direct self-hosting over IPv4 is not viable without upstream campus-network NAT/port-forwarding support.

## Goal

Publish `https://pumpkinwy.online` from the existing local Docker deployment without depending on inbound public IPv4 access to the campus-network host.

## Constraints

- Keep the existing Dockerized application architecture
- Avoid dependence on campus-network firewall, NAT, or port-forwarding changes
- Minimize application-code changes
- Preserve the existing local reverse-proxy structure unless removing it creates clear simplification
- Keep deployment operational even while email template review is pending

## Options Considered

### Option 1: Ask the campus network to expose public IPv4 ports

Pros:

- Keeps a traditional self-hosted topology
- No additional edge provider dependency

Cons:

- Requires external administrative cooperation
- Lead time and feasibility are unknown
- Current evidence shows inbound traffic is not reaching the host

Decision: Rejected as the primary path because it is outside the operator's control and blocks progress.

### Option 2: Publish directly over IPv6

Pros:

- The host has global IPv6 addresses
- May avoid the campus IPv4 NAT problem

Cons:

- Reachability from all clients is not guaranteed
- Inbound IPv6 policy is not yet verified
- DNS, TLS, and client compatibility become harder to validate under time pressure

Decision: Keep as a fallback, not the primary deployment path.

### Option 3: Use Cloudflare Tunnel

Pros:

- Requires outbound connectivity only
- Avoids dependence on campus-network inbound IPv4 exposure
- Keeps the existing local Docker stack largely intact
- Simplifies public TLS and hostname publishing

Cons:

- Requires moving DNS authority for `pumpkinwy.online` to Cloudflare
- Adds a Cloudflare-managed edge dependency

Decision: Recommended and selected.

## Selected Architecture

Public traffic flow:

`Browser -> Cloudflare DNS/Edge -> Cloudflare Tunnel -> local cloudflared container -> caddy -> app`

Local service flow remains:

- `app` listens on internal port `3000`
- `caddy` listens inside Docker and proxies to `app`
- `mysql` remains local and persistent

Operational changes:

- Add a `cloudflared` service to Docker Compose
- Store Cloudflare tunnel credentials on disk outside the image
- Route the production hostname `pumpkinwy.online` to the tunnel
- Keep `caddy` as the local HTTP entrypoint to avoid reworking local reverse-proxy assumptions

## Configuration Design

### Docker Compose

Add a `cloudflared` service with:

- image `cloudflare/cloudflared`
- restart policy `unless-stopped`
- dependency on `caddy`
- a mounted config file
- a mounted credentials directory
- command `tunnel --config /etc/cloudflared/config.yml run`

### Cloudflared Config

Create a config file that defines:

- `tunnel`: Cloudflare tunnel UUID
- `credentials-file`: mounted JSON credentials path
- ingress rules:
  - hostname `pumpkinwy.online` -> `http://caddy:80`
  - catch-all `http_status:404`

### Environment and Secrets

Add deployment variables for:

- Cloudflare tunnel ID
- cloudflared credentials path on the host

Do not store Cloudflare account secrets in the repository.

### DNS

Move `pumpkinwy.online` authoritative DNS to Cloudflare.

Cloudflare will then publish the tunnel hostname binding instead of exposing the origin directly by public A/AAAA records.

## TLS Design

External TLS terminates at Cloudflare.

Between Cloudflare Tunnel and the local host, traffic is carried inside the tunnel. Local `caddy` can continue serving plain HTTP on the Docker network. This removes the need for local ACME issuance on the campus-network host.

As part of this migration:

- local public-port TLS issuance in `caddy` is no longer required for production reachability
- host-level public `80/443` exposure becomes optional

## Rollout Plan

1. Keep the current application stack intact
2. Add `cloudflared` service and config files
3. Create a Cloudflare tunnel and obtain credentials
4. Point `pumpkinwy.online` to the tunnel in Cloudflare
5. Start `cloudflared`
6. Verify public access over HTTPS

## Failure Handling

- If tunnel auth is missing or invalid, the application stack still runs locally
- If Cloudflare Tunnel is down, local Docker services remain available for local diagnostics
- If IPv4 remains blocked, the tunnel still works because it only requires outbound connectivity

## Verification Criteria

Deployment is considered successful when:

- `docker compose ps` shows `app`, `mysql`, `caddy`, and `cloudflared` healthy/running
- `https://pumpkinwy.online/healthz` returns a success response through Cloudflare
- local stack remains functional independently of the tunnel
- no dependency remains on direct inbound IPv4 access to the campus-network host

## Out of Scope

- Restoring email-login delivery
- Replacing MySQL with a file-backed database
- Removing `caddy`
- Re-architecting authentication flows
