import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  envMock,
  getCurrentAuthSession,
  upsertUser,
  getUserByAuthUserId,
} = vi.hoisted(() => ({
  envMock: {
    guestAccessEnabled: false,
  },
  getCurrentAuthSession: vi.fn(),
  upsertUser: vi.fn(),
  getUserByAuthUserId: vi.fn(),
}));

vi.mock("./_core/auth", () => ({
  getCurrentAuthSession,
}));

vi.mock("./db", () => ({
  upsertUser,
  getUserByAuthUserId,
}));

vi.mock("./_core/env", () => ({
  ENV: envMock,
}));

import { createContext } from "./_core/context";

const GUEST_COOKIE_NAME = "ai_tutor_guest_id";

type CookieCall = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

function createRequest(cookieHeader?: string) {
  return {
    protocol: "https",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  } as any;
}

function createResponse(cookieCalls: CookieCall[]) {
  return {
    cookie: (name: string, value: string, options: Record<string, unknown>) => {
      cookieCalls.push({ name, value, options });
    },
  } as any;
}

describe("guest access context", () => {
  beforeEach(() => {
    envMock.guestAccessEnabled = false;
    getCurrentAuthSession.mockReset();
    upsertUser.mockReset();
    getUserByAuthUserId.mockReset();
  });

  it("returns null when guest access is disabled and no session exists", async () => {
    getCurrentAuthSession.mockResolvedValueOnce(null);
    const cookieCalls: CookieCall[] = [];

    const context = await createContext({
      req: createRequest(),
      res: createResponse(cookieCalls),
    });

    expect(context.user).toBeNull();
    expect(cookieCalls).toEqual([]);
    expect(upsertUser).not.toHaveBeenCalled();
    expect(getUserByAuthUserId).not.toHaveBeenCalled();
  });

  it("creates a guest cookie and resolves a guest user when guest access is enabled", async () => {
    envMock.guestAccessEnabled = true;
    getCurrentAuthSession.mockResolvedValueOnce(null);
    getUserByAuthUserId.mockImplementationOnce(async (authUserId: string) => ({
      id: 101,
      authUserId,
      email: null,
      name: "Guest Learner",
      loginMethod: "guest",
      role: "user",
      level: "A2",
      totalPracticeSeconds: 0,
      totalConversations: 0,
      avgPronunciationScore: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    }));
    const cookieCalls: CookieCall[] = [];

    const context = await createContext({
      req: createRequest(),
      res: createResponse(cookieCalls),
    });

    expect(upsertUser).toHaveBeenCalledTimes(1);
    expect(upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: expect.stringMatching(/^guest:/),
        email: null,
        loginMethod: "guest",
        role: "user",
      })
    );

    const authUserId = upsertUser.mock.calls[0]?.[0]?.authUserId as string;
    const guestId = authUserId.replace(/^guest:/, "");

    expect(cookieCalls).toEqual([
      expect.objectContaining({
        name: GUEST_COOKIE_NAME,
        value: guestId,
        options: expect.objectContaining({
          httpOnly: true,
          path: "/",
          sameSite: "lax",
          secure: true,
        }),
      }),
    ]);
    expect(getUserByAuthUserId).toHaveBeenCalledWith(authUserId);
    expect(context.user).toMatchObject({
      id: 101,
      authUserId,
      loginMethod: "guest",
    });
  });

  it("reuses an existing guest cookie without issuing a new one", async () => {
    envMock.guestAccessEnabled = true;
    getCurrentAuthSession.mockResolvedValueOnce(null);
    getUserByAuthUserId.mockImplementationOnce(async (authUserId: string) => ({
      id: 202,
      authUserId,
      email: null,
      name: "Existing Guest",
      loginMethod: "guest",
      role: "user",
      level: "A2",
      totalPracticeSeconds: 0,
      totalConversations: 0,
      avgPronunciationScore: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    }));
    const cookieCalls: CookieCall[] = [];

    const context = await createContext({
      req: createRequest(`${GUEST_COOKIE_NAME}=guest-123`),
      res: createResponse(cookieCalls),
    });

    expect(upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: "guest:guest-123",
        loginMethod: "guest",
      })
    );
    expect(cookieCalls).toEqual([]);
    expect(getUserByAuthUserId).toHaveBeenCalledWith("guest:guest-123");
    expect(context.user).toMatchObject({
      id: 202,
      authUserId: "guest:guest-123",
      loginMethod: "guest",
    });
  });
});
