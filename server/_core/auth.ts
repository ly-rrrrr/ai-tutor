import type { Express, Request } from "express";
import type { IncomingHttpHeaders } from "http";
import { betterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import { captcha, emailOTP, username } from "better-auth/plugins";
import { COOKIE_NAME } from "@shared/const";
import { getRequiredMySqlPool } from "./mysql";
import { ENV } from "./env";
import { isValidSmtpPort, sendEmail } from "./email";
import { createFixedWindowLimiter } from "./rateLimit";

export type AuthIdentity = {
  id: string;
  email: string | null;
  name: string | null;
  emailVerified: boolean;
};

export type AuthSessionInfo = {
  id: string;
  userId: string;
  expiresAt: Date;
};

type AuthSessionResult = {
  user: AuthIdentity;
  session: AuthSessionInfo;
};

type VerificationOtpType =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

const APP_NAME = "AI Tutor";
const VERIFICATION_OTP_LOGIN_TEXT = "Verify your email to continue";
const VERIFICATION_OTP_EXPIRES_IN_MINUTES = 10;
const AUTH_RATE_LIMIT_PATHS = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/username",
  "/sign-in/email-otp",
  "/send-verification-email",
  "/email-otp/send-verification-otp",
  "/email-otp/check-verification-otp",
  "/email-otp/verify-email",
]);

function createAuthInstance() {
  return betterAuth({
    appName: APP_NAME,
    baseURL: normalizeOrigin(ENV.appOrigin),
    basePath: "/api/auth",
    secret: ENV.betterAuthSecret,
    trustedOrigins: [normalizeOrigin(ENV.appOrigin)],
    database: getRequiredMySqlPool(),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      requireEmailVerification: true,
    },
    user: {
      modelName: "auth_users",
    },
    session: {
      modelName: "auth_sessions",
      cookieCache: {
        enabled: false,
      },
    },
    account: {
      modelName: "auth_accounts",
    },
    verification: {
      modelName: "auth_verifications",
    },
    advanced: {
      useSecureCookies: ENV.isProduction,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: ENV.isProduction,
        path: "/",
      },
      cookies: {
        session_token: {
          name: COOKIE_NAME,
          attributes: {
            httpOnly: true,
            sameSite: "lax",
            secure: ENV.isProduction,
            path: "/",
          },
        },
      },
      database: {
        generateId: "uuid",
      },
    },
    plugins: [
      username(),
      emailOTP({
        expiresIn: VERIFICATION_OTP_EXPIRES_IN_MINUTES * 60,
        overrideDefaultEmailVerification: true,
        sendVerificationOTP: async ({ email, otp, type }) => {
          await sendVerificationOtpEmail(email, otp, type);
        },
      }),
      captcha({
        provider: "cloudflare-turnstile",
        secretKey: ENV.turnstileSecretKey,
        endpoints: Array.from(AUTH_RATE_LIMIT_PATHS),
      }),
    ],
  });
}

let authInstance: ReturnType<typeof createAuthInstance> | null = null;

const authIpLimiter = createFixedWindowLimiter({
  key: "auth-ip",
  maxHits: 5,
  windowMs: 60 * 60 * 1000,
});

const authIdentityLimiter = createFixedWindowLimiter({
  key: "auth-identity",
  maxHits: 3,
  windowMs: 60 * 60 * 1000,
});

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "");
}

function shouldRateLimitAuthRequest(req: Request) {
  if (req.method !== "POST") {
    return false;
  }

  return AUTH_RATE_LIMIT_PATHS.has(req.path.toLowerCase().replace(/\/+$/, ""));
}

function isAuthConfigured() {
  if (!ENV.databaseUrl || !ENV.betterAuthSecret) {
    return false;
  }

  const emailProvider = ENV.emailProvider.trim().toLowerCase();

  if (emailProvider === "disabled") {
    return false;
  }

  if (!ENV.turnstileSecretKey) {
    return false;
  }

  if (emailProvider === "smtp") {
    return Boolean(
      ENV.smtpHost &&
        isValidSmtpPort(ENV.smtpPort) &&
        ENV.smtpUser &&
        ENV.smtpPass &&
        ENV.emailFrom
    );
  }

  if (emailProvider === "tencent_ses_api") {
    return Boolean(
      ENV.tencentSesSecretId &&
        ENV.tencentSesSecretKey &&
        ENV.tencentSesRegion &&
        ENV.emailFrom &&
        (ENV.tencentSesAllowSimpleContent ||
          ENV.tencentSesVerificationOtpTemplateId)
    );
  }

  return false;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function deriveDisplayName(email: string) {
  const localPart = email.split("@")[0] ?? "Learner";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function toWebHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        result.append(key, item);
      }
      continue;
    }

    result.set(key, value);
  }

  return result;
}

async function sendVerificationOtpEmail(
  email: string,
  otp: string,
  type: VerificationOtpType
) {
  if (type !== "email-verification") {
    throw new Error(`Unsupported OTP email type: ${type}`);
  }

  const subject = VERIFICATION_OTP_LOGIN_TEXT;
  const text = `Your verification code is ${otp}. It expires in ${VERIFICATION_OTP_EXPIRES_IN_MINUTES} minutes.`;

  await sendEmail({
    to: email,
    subject,
    text,
    templateAlias: "verification_otp",
    templateData: {
      appName: APP_NAME,
      loginText: VERIFICATION_OTP_LOGIN_TEXT,
      otp,
      expiresInMinutes: VERIFICATION_OTP_EXPIRES_IN_MINUTES,
    },
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
        <h1 style="font-size:24px;margin:0 0 16px;">${subject}</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
          Your verification code is <strong>${escapeHtml(otp)}</strong>.
        </p>
        <p style="font-size:15px;line-height:1.6;margin:0;">
          It expires in ${VERIFICATION_OTP_EXPIRES_IN_MINUTES} minutes.
        </p>
      </div>
    `,
  });
}

function getAuth() {
  if (authInstance) {
    return authInstance;
  }

  authInstance = createAuthInstance();

  return authInstance;
}

function normalizeSessionPayload(payload: any): AuthSessionResult | null {
  if (!payload?.user || !payload?.session) {
    return null;
  }

  return {
    user: {
      id: String(payload.user.id),
      email: payload.user.email ?? null,
      name:
        payload.user.name?.trim() ||
        (payload.user.email ? deriveDisplayName(payload.user.email) : null),
      emailVerified: Boolean(payload.user.emailVerified),
    },
    session: {
      id: String(payload.session.id),
      userId: String(payload.session.userId),
      expiresAt: new Date(payload.session.expiresAt),
    },
  };
}

export function registerAuthRoutes(app: Express) {
  app.use("/api/auth", (req, res, next) => {
    if (!shouldRateLimitAuthRequest(req)) {
      next();
      return;
    }

    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const ipHit = authIpLimiter.consume(ip);

    if (!ipHit.allowed) {
      res.status(429).json({
        error: "Too many auth requests. Please try again later.",
      });
      return;
    }

    const identity =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : typeof req.body?.username === "string"
          ? req.body.username.trim().toLowerCase()
          : "";

    if (identity) {
      const identityHit = authIdentityLimiter.consume(identity);
      if (!identityHit.allowed) {
        res.status(429).json({
          error: "Too many auth requests. Please try again later.",
        });
        return;
      }
    }

    next();
  });

  app.all("/api/auth/*", async (req, res) => {
    if (!isAuthConfigured()) {
      res.status(503).json({
        error:
          "Authentication is temporarily disabled. Configure EMAIL_PROVIDER and the matching email provider settings to enable sign-in.",
      });
      return;
    }

    const handler = toNodeHandler(getAuth());
    return handler(req, res);
  });
}

export async function getCurrentAuthSession(
  req: Request
): Promise<AuthSessionResult | null> {
  if (!isAuthConfigured()) {
    return null;
  }

  try {
    const payload = await getAuth().api.getSession({
      headers: toWebHeaders(req.headers),
    });
    return normalizeSessionPayload(payload);
  } catch (error) {
    console.warn("[Auth] Failed to read session", error);
    return null;
  }
}

export async function signOutCurrentSession(req: Request): Promise<void> {
  if (!isAuthConfigured()) {
    return;
  }

  try {
    await getAuth().api.signOut({
      headers: toWebHeaders(req.headers),
    });
  } catch (error) {
    console.warn("[Auth] Failed to sign out session", error);
  }
}

export function resetAuthRateLimitersForTest() {
  authIpLimiter.reset();
  authIdentityLimiter.reset();
}
