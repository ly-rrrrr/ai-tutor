import { randomUUID } from "node:crypto";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { getCurrentAuthSession } from "./auth";
import { getGuestCookieId, setGuestCookie } from "./cookies";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  authSessionId: string | null;
};

/** Dev-mode mock user — injected when NODE_ENV=development and no real session exists */
export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let authSessionId: string | null = null;
  let currentSession = null;

  try {
    currentSession = await getCurrentAuthSession(opts.req);
  } catch (error) {
    console.warn("[Auth] Context authentication failed", error);
  }

  if (currentSession?.user) {
    authSessionId = currentSession.session.id;
    await db.upsertUser({
      authUserId: currentSession.user.id,
      email: currentSession.user.email,
      name: currentSession.user.name,
      loginMethod: "password",
      lastSignedIn: new Date(),
    });

    user = (await db.getUserByAuthUserId(currentSession.user.id)) ?? null;
  } else if (ENV.guestAccessEnabled) {
    const existingGuestId = getGuestCookieId(opts.req);
    const guestId = existingGuestId ?? randomUUID().replace(/-/g, "");

    if (!existingGuestId) {
      setGuestCookie(opts.res, opts.req, guestId);
    }

    const guestAuthUserId = `guest:${guestId}`;

    await db.upsertUser({
      authUserId: guestAuthUserId,
      email: null,
      name: "Guest User",
      loginMethod: "guest",
      role: "user",
      lastSignedIn: new Date(),
    });

    user = (await db.getUserByAuthUserId(guestAuthUserId)) ?? null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    authSessionId,
  };
}
