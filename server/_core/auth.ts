import type { Express, Request } from "express";
import type { IncomingHttpHeaders } from "http";
import { betterAuth } from "better-auth";
import { toNodeHandler } from "better-auth/node";
import { magicLink } from "better-auth/plugins";
import { COOKIE_NAME } from "@shared/const";
import { getRequiredMySqlPool } from "./mysql";
import { ENV } from "./env";
import { isValidSmtpPort, sendEmail } from "./email";

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

function createAuthInstance() {
  return betterAuth({
    appName: "AI Tutor",
    baseURL: normalizeOrigin(ENV.appOrigin),
    basePath: "/api/auth",
    secret: ENV.betterAuthSecret,
    trustedOrigins: [normalizeOrigin(ENV.appOrigin)],
    database: getRequiredMySqlPool(),
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
      magicLink({
        expiresIn: 60 * 10,
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkEmail(email, url);
        },
      }),
    ],
  });
}

let authInstance: ReturnType<typeof createAuthInstance> | null = null;

function normalizeOrigin(value: string) {
  return value.replace(/\/+$/, "");
}

function isAuthConfigured() {
  return Boolean(
    ENV.databaseUrl &&
      ENV.betterAuthSecret &&
      ENV.smtpHost &&
      isValidSmtpPort(ENV.smtpPort) &&
      ENV.smtpUser &&
      ENV.smtpPass &&
      ENV.smtpFromEmail
  );
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

async function sendMagicLinkEmail(email: string, url: string) {
  const safeUrl = escapeHtml(url);
  const appName = "AI Tutor";
  const loginText = `Sign in to ${appName}`;

  await sendEmail({
    to: email,
    subject: loginText,
    text: `Use this link to sign in to ${appName}: ${url}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">
        <h1 style="font-size:24px;margin:0 0 16px;">${loginText}</h1>
        <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
          Click the button below to sign in. This link expires in 10 minutes.
        </p>
        <p style="margin:24px 0;">
          <a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:10px;">
            Sign in
          </a>
        </p>
        <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0;">
          If the button does not work, copy and paste this URL into your browser:
        </p>
        <p style="font-size:13px;line-height:1.6;word-break:break-all;color:#2563eb;">${safeUrl}</p>
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
  app.all("/api/auth/*", async (req, res) => {
    if (!isAuthConfigured()) {
      res.status(503).json({
        error:
          "Authentication is not configured. Set DATABASE_URL, BETTER_AUTH_SECRET, SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_FROM_EMAIL.",
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
