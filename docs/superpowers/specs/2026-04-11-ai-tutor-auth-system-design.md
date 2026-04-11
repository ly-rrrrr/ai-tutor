# AI Tutor Auth System Design

## Goal

Replace the current magic-link-only login with a mainstream authentication system that supports:

- registration with username, email, password, confirm password, human verification, and email verification code
- login with username or email plus password
- optional guest access that can be toggled off by environment variable

The system must continue to work with Tencent SES API template mode and must not require template variables that contain clickable verification links.

## Current State

- The product currently exposes only a magic-link login page at `/login`.
- The server uses Better Auth with the `magicLink(...)` plugin.
- Tencent SES API template mode is already wired into the mail layer.
- Guest access has been added separately at the TRPC context layer and is controlled by `GUEST_ACCESS_ENABLED`.
- The site is already running behind Cloudflare Tunnel, so Cloudflare Turnstile is the natural captcha choice.

## Selected Approach

Use Better Auth as the single authentication engine and switch the app to a combined stack of:

- `emailAndPassword` for password registration and password login
- `username` for unique usernames and username-based sign-in
- `email-otp` for email verification codes
- `captcha` with Cloudflare Turnstile for human verification on registration

This keeps user/session/account persistence, cookies, verification records, password hashing, and sign-in flows inside Better Auth instead of splitting responsibilities across custom auth code.

## Alternatives Considered

### 1. Build a custom auth layer around the current app tables

Rejected.

This would duplicate user/session/verification/password logic that Better Auth already provides. It would also increase security risk and maintenance cost.

### 2. Keep magic links and only change template variables

Rejected.

The core problem is not branding. Tencent template review is hostile to dynamic link delivery. Continuing to rely on link-based login keeps the product constrained by the same review issue.

### 3. Replace Tencent SES with another mail provider first

Deferred.

That would solve the template limitation, but it does not address the broader need for a conventional registration/login flow. The current goal is to keep Tencent SES API template mode and redesign the auth UX.

## Product Behavior

### Registration

The registration flow will require:

- username
- email
- password
- confirm password
- Cloudflare Turnstile token

After successful registration submission:

1. the account is created in Better Auth with `emailVerified=false`
2. a verification OTP email is sent through Tencent SES API template mode
3. the UI transitions into an email verification step
4. the account cannot log in with password until email verification succeeds

The registration UI should not ask for a separate display name. The initial Better Auth `name` field should be derived from the chosen username to avoid adding another required field the user did not request.

### Email Verification

The email verification step will ask for:

- email
- verification code

Users must be able to:

- submit the OTP to verify the email
- resend the OTP if needed

The verification email template must contain only non-link variables, for example:

- `appName`
- `loginText`
- `otp`
- `expiresInMinutes`

### Login

The login flow will accept a single identifier field and a password.

Identifier behavior:

- if the input contains `@`, treat it as email and use Better Auth email/password sign-in
- otherwise, treat it as username and use Better Auth username/password sign-in

If the account exists but the email is not verified:

- login must fail
- the UI must present a clear instruction to verify email first
- the user should be able to request a new verification code

### Guest Access

Guest mode remains supported and controlled by `GUEST_ACCESS_ENABLED`.

Behavior:

- when enabled, the auth page shows a guest entry path
- when disabled, the guest entry path is hidden
- guest sessions remain browser-scoped as already implemented
- authenticated sessions continue to override guest identity

### Google OAuth

Deferred from this implementation.

The design should keep the auth page structure compatible with adding a future optional Google sign-in button, but no Google server/client configuration will be implemented in this phase.

## Architecture

### Server Auth Stack

The Better Auth configuration in [server/_core/auth.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/server/_core/auth.ts) will be reworked to use:

- email/password auth
- username plugin
- email OTP plugin
- captcha plugin

The configuration should enforce:

- password sign-in enabled
- email verification required before password login
- username uniqueness and normalization
- Turnstile validation on sign-up endpoint

The existing session cookie configuration and MySQL-backed Better Auth tables remain in place.

### App User Sync

The product-level `users` table will continue to be synchronized lazily through `createContext()`.

That means:

- when an authenticated Better Auth session is present, the current `upsertUser()` flow remains responsible for product user synchronization
- guest access logic remains as a fallback only when no authenticated session exists and guest mode is enabled

No separate application-level auth table should be introduced.

### Mail Delivery

Tencent SES API template mode remains the only production mail target in this design.

The old magic-link template usage will be removed. Replace it with a verification-code template alias and corresponding template data that does not include URLs.

This requires replacing the current environment contract that points to a magic-link template ID. The new env should describe an OTP verification template instead.

### Captcha

Human verification should use Cloudflare Turnstile because:

- the site is already behind Cloudflare
- it reduces new third-party integration surface
- Better Auth already supports a Cloudflare Turnstile captcha plugin

The client must collect the Turnstile response token and include it in the registration request. The server must validate it through Better Auth's captcha plugin.

## UI Structure

The existing [Login.tsx](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/client/src/pages/Login.tsx) page should be replaced by a unified auth screen with these states:

- login tab
- register tab
- verify-email step

### Login Tab

Fields:

- username or email
- password

Actions:

- sign in
- switch to register
- optional continue as guest button when guest mode is enabled

### Register Tab

Fields:

- username
- email
- password
- confirm password
- Turnstile widget

Actions:

- create account
- switch to login

### Verify Email Step

Fields:

- verification code

Actions:

- verify code
- resend code
- back to login

## Data Flow

### Registration

1. User fills registration form and passes Turnstile.
2. Client calls Better Auth email/password sign-up with username as an additional field.
3. Better Auth creates the auth user with `emailVerified=false`.
4. Better Auth email-otp flow sends a verification code email.
5. Client transitions to verify-email state.

### Email Verification

1. User enters the OTP code.
2. Client calls Better Auth email-otp verification endpoint.
3. Better Auth marks the auth user as `emailVerified=true`.
4. Client redirects to login or, if session is established by the endpoint, directly to `/app`.

### Login

1. User enters identifier and password.
2. Client routes to either username sign-in or email sign-in based on identifier format.
3. Better Auth verifies password and `emailVerified` requirement.
4. On success, Better Auth issues the session cookie.
5. Existing `createContext()` logic synchronizes the product user row.

### Guest Entry

1. User chooses guest entry.
2. No Better Auth session is created.
3. Existing guest cookie flow provisions browser-scoped guest identity.

## Error Handling

The auth UI must explicitly handle:

- invalid username format
- username already taken
- email already used
- weak or invalid password
- password mismatch
- missing captcha response
- captcha verification failure
- invalid OTP
- expired OTP
- too many OTP attempts
- login rejected because email is not verified
- invalid username/email or password

The messaging should stay short and specific. Continue using toast feedback where it already exists, but field-level inline validation should be added for password confirmation and obvious required-field issues.

## Configuration Changes

### New / Updated Auth Environment

The design expects new auth-related environment values for:

- Cloudflare Turnstile site key
- Cloudflare Turnstile secret key
- Tencent SES verification OTP template ID
- guest access toggle remains unchanged

The previous Tencent magic-link template env should be replaced or deprecated in favor of an OTP verification template env.

## Files Expected to Change

### Server

- [server/_core/auth.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/server/_core/auth.ts)
- [server/_core/env.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/server/_core/env.ts)
- [server/_core/email.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/server/_core/email.ts)
- [server/_core/tencentSes.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/server/_core/tencentSes.ts)
- [server/_core/productionConfig.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/server/_core/productionConfig.ts)

### Client

- [client/src/lib/auth-client.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/client/src/lib/auth-client.ts)
- [client/src/pages/Login.tsx](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/client/src/pages/Login.tsx)
- [client/src/App.tsx](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/client/src/App.tsx) only if route structure changes

### Tests

- [server/email.test.ts](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/server/email.test.ts)
- new auth/login UI tests if present in current test setup
- existing guest access tests must continue to pass

### Docs / Env Examples

- [.env.example](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/.env.example)
- [.env.production.example](/home/yea/.config/superpowers/worktrees/ai-tutor/cloudflare-tunnel/.env.production.example)
- deployment docs for Tencent SES template naming and Turnstile keys

## Testing Strategy

### Server

- verify Tencent SES template payload now carries OTP fields, not URL fields
- verify production config requires Turnstile and OTP template env when the new auth flow is enabled
- verify Better Auth config still allows guest mode fallback outside authenticated sessions

### Client

- verify register form validation for required fields and password confirmation
- verify successful registration transitions to verify-email state
- verify successful verification completes the expected next step
- verify login routes correctly for email versus username identifiers
- verify guest button visibility follows config

### End-to-End

After deployment:

- register a new account with username, email, password, and Turnstile
- receive Tencent SES verification code email
- complete email verification
- log in with username and password
- log in with email and password
- confirm guest access still works when enabled
- confirm guest access disappears when disabled

## Out of Scope

- Google OAuth implementation
- password reset flow redesign
- admin user management UI
- social account linking

Those can be added later without changing the core direction of this design.
