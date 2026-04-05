import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { getCurrentAuthSession } from "./auth";

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

  try {
    const currentSession = await getCurrentAuthSession(opts.req);

    if (currentSession?.user) {
      authSessionId = currentSession.session.id;
      await db.upsertUser({
        authUserId: currentSession.user.id,
        email: currentSession.user.email,
        name: currentSession.user.name,
        loginMethod: "magic_link",
        lastSignedIn: new Date(),
      });

      user = (await db.getUserByAuthUserId(currentSession.user.id)) ?? null;
    }
  } catch (error) {
    console.warn("[Auth] Context authentication failed", error);
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    authSessionId,
  };
}
