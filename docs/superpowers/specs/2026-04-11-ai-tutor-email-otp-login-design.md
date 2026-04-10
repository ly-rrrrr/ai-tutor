# AI Tutor Email OTP Login Design

## Goal

Replace the current magic-link login flow with email verification codes so Tencent SES template delivery can remain in template mode and pass template review without embedding link variables.

## Current State

- The login page calls `authClient.signIn.magicLink(...)`.
- The server uses Better Auth's `magicLink(...)` plugin in [server/_core/auth.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/server/_core/auth.ts).
- Tencent SES template mode is enabled by configuration when `TENCENT_SES_ALLOW_SIMPLE_CONTENT=false`.
- The current magic-link email template requires a `url` variable that contains a clickable verification link. This conflicts with Tencent SES template review constraints.

## Selected Approach

Use Better Auth's built-in `email-otp` plugin end-to-end.

This keeps session creation, cookie handling, verification record storage, and login completion inside Better Auth rather than introducing a parallel custom authentication system. The server will send code-based emails through the existing `sendEmail()` abstraction, which continues to route through Tencent SES API template mode.

## Alternatives Considered

### 1. Keep magic links and change template variables

Rejected.

Even if the template is changed from `url` to `linkPath`, the login flow still fundamentally depends on sending a clickable verification link. That keeps the product tied to Tencent's template review constraints and may still be rejected if variables participate in URL construction.

### 2. Build a custom OTP system outside Better Auth

Rejected.

This would require custom code for OTP generation, secure storage, expiry, attempts, rate limiting, and session issuance. Better Auth already ships an `email-otp` plugin that handles those concerns and fits the current session model.

### 3. Switch to another email provider and keep magic links

Deferred.

This would work, but it adds provider migration work and operational change. The current objective is to preserve Tencent SES API template mode.

## Architecture

### Server

The authentication plugin in [server/_core/auth.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/server/_core/auth.ts) will switch from `magicLink(...)` to `emailOTP(...)`.

The plugin will be configured to:

- send OTP emails for sign-in
- use Tencent SES template mode through the existing `sendEmail()` function
- keep Better Auth's session and verification storage model
- continue to rely on the existing `auth_users`, `auth_sessions`, and `auth_verifications` tables

The email content will no longer contain a login URL. Instead, the template data will contain only non-link values such as:

- `appName`
- `loginText`
- `otp`
- `expiresInMinutes`

### Client

The Better Auth client in [client/src/lib/auth-client.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/client/src/lib/auth-client.ts) will switch from `magicLinkClient()` to `emailOTPClient()`.

The login page in [client/src/pages/Login.tsx](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/client/src/pages/Login.tsx) will become a two-step flow:

1. User enters email and requests a verification code.
2. User enters the received OTP code to complete sign-in.

The page will keep the existing redirect behavior after successful authentication.

## Data Flow

### Requesting a code

1. The client submits the email address.
2. Better Auth's email-otp endpoint generates an OTP and stores it through Better Auth's verification backend.
3. The server sends a Tencent SES template email using only non-link variables.
4. The client shows a confirmation state and an OTP entry form.

### Completing sign-in

1. The client submits the email plus OTP code.
2. Better Auth verifies the code.
3. If successful, Better Auth creates the authenticated session cookie.
4. The existing `createContext()` flow continues to call `upsertUser()` and resolve the product user record.

## Error Handling

The login page must explicitly handle:

- invalid email input
- failed OTP send requests
- invalid OTP
- expired OTP
- too many attempts
- general server failures

The UI should keep error messages short and specific. Existing toast-based feedback is sufficient.

The server should keep the current IP/email rate limiting middleware for `/api/auth` requests. If additional OTP-specific limits are needed, Better Auth plugin defaults should be used before introducing custom logic.

## Compatibility and Migration

- This change replaces magic-link sign-in rather than supporting both flows in parallel.
- Existing authenticated sessions remain valid because session issuance still goes through Better Auth.
- Guest access can remain enabled during rollout. It does not conflict with authenticated user sessions.
- Tencent SES admin notification template flow remains unchanged.

## Files Expected to Change

- [server/_core/auth.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/server/_core/auth.ts)
- [client/src/lib/auth-client.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/client/src/lib/auth-client.ts)
- [client/src/pages/Login.tsx](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/client/src/pages/Login.tsx)
- [server/email.test.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/server/email.test.ts)
- environment/documentation files for template expectations

## Testing Strategy

### Server

- Verify email sending uses OTP template data instead of URL template data.
- Verify Tencent SES template-mode payload still uses `TemplateID` and now carries `otp`.
- Verify production config still accepts Tencent SES template mode.

### Client

- Verify the login page switches from email entry to OTP entry after a successful send.
- Verify invalid OTP and send failures surface the correct user-visible errors.
- Verify successful OTP sign-in redirects into the app.

### End-to-End Verification

After deployment:

- request an OTP from the live login page
- confirm the Tencent SES email contains only a verification code, not a magic link
- complete login with the received OTP
- confirm `auth.me` returns an authenticated user session

## Operational Notes

- A new Tencent SES template is required for OTP login. The current magic-link template should not be reused.
- The OTP email template should contain fixed domain/product branding but no dynamic link variable.
- Because Tencent credentials were previously exposed in chat, they should be rotated before final rollout.
