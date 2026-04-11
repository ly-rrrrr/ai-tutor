import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const betterAuthMock = vi.hoisted(() => vi.fn());
const toNodeHandlerMock = vi.hoisted(() => vi.fn());
const captchaMock = vi.hoisted(() => vi.fn());
const emailOtpMock = vi.hoisted(() => vi.fn());
const usernameMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());
const getRequiredMySqlPoolMock = vi.hoisted(() => vi.fn(() => ({})));

vi.mock("better-auth", () => ({
  betterAuth: betterAuthMock,
}));

vi.mock("better-auth/node", () => ({
  toNodeHandler: toNodeHandlerMock,
}));

vi.mock("better-auth/plugins", () => ({
  captcha: captchaMock,
  emailOTP: emailOtpMock,
  username: usernameMock,
}));

vi.mock("./_core/mysql", () => ({
  getRequiredMySqlPool: getRequiredMySqlPoolMock,
}));

vi.mock("./_core/email", () => ({
  isValidSmtpPort: vi.fn(() => true),
  sendEmail: sendEmailMock,
}));

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();

  process.env = {
    ...ORIGINAL_ENV,
    APP_ORIGIN: "https://app.example.com",
    DATABASE_URL: "mysql://user:pass@localhost:3306/ai_tutor",
    BETTER_AUTH_SECRET: "super-secret",
    EMAIL_PROVIDER: "smtp",
    EMAIL_FROM: "noreply@example.com",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_USER: "mailer-user",
    SMTP_PASS: "mailer-pass",
    CLOUDFLARE_TURNSTILE_SITE_KEY: "turnstile-site-key",
    CLOUDFLARE_TURNSTILE_SECRET_KEY: "turnstile-secret-key",
  };

  betterAuthMock.mockReturnValue({
    api: {
      getSession: vi.fn(),
      signOut: vi.fn(),
    },
  });

  toNodeHandlerMock.mockReturnValue(vi.fn());
  captchaMock.mockReturnValue({ id: "captcha" });
  emailOtpMock.mockReturnValue({ id: "email-otp" });
  usernameMock.mockReturnValue({ id: "username" });
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("auth", () => {
  it("protects only sign-up email with Turnstile captcha", async () => {
    const { registerAuthRoutes } = await import("./_core/auth");

    let authMiddleware: ((req: any, res: any, next: () => void) => void) | null =
      null;
    let authHandler: ((req: any, res: any) => unknown) | null = null;

    const app = {
      use: vi.fn((_path: string, handler: typeof authMiddleware) => {
        authMiddleware = handler;
      }),
      all: vi.fn((_path: string, handler: typeof authHandler) => {
        authHandler = handler;
      }),
    } as any;

    registerAuthRoutes(app);

    expect(authMiddleware).toBeTypeOf("function");
    expect(authHandler).toBeTypeOf("function");

    const req = {
      method: "POST",
      path: "/api/auth/sign-in/email",
      body: { email: "learner@example.com" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      headers: {},
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await new Promise<void>(resolve => {
      authMiddleware?.(req, res, () => {
        void authHandler?.(req, res);
        resolve();
      });
    });

    expect(captchaMock).toHaveBeenCalledTimes(1);
    expect(captchaMock.mock.calls[0]?.[0]).toMatchObject({
      provider: "cloudflare-turnstile",
      secretKey: "turnstile-secret-key",
      endpoints: ["/sign-up/email"],
    });
  });

  it("sends the Chinese verification OTP email copy", async () => {
    const { registerAuthRoutes } = await import("./_core/auth");

    let authMiddleware: ((req: any, res: any, next: () => void) => void) | null =
      null;
    let authHandler: ((req: any, res: any) => unknown) | null = null;

    const app = {
      use: vi.fn((_path: string, handler: typeof authMiddleware) => {
        authMiddleware = handler;
      }),
      all: vi.fn((_path: string, handler: typeof authHandler) => {
        authHandler = handler;
      }),
    } as any;

    registerAuthRoutes(app);

    const req = {
      method: "POST",
      path: "/api/auth/sign-up/email",
      body: { email: "learner@example.com" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
      headers: {},
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as any;

    await new Promise<void>(resolve => {
      authMiddleware?.(req, res, () => {
        void authHandler?.(req, res);
        resolve();
      });
    });

    const emailOtpOptions = emailOtpMock.mock.calls[0]?.[0];
    expect(emailOtpOptions).toBeTruthy();

    await emailOtpOptions.sendVerificationOTP({
      email: "learner@example.com",
      otp: "123456",
      type: "email-verification",
    });

    expect(sendEmailMock).toHaveBeenCalledWith({
      to: "learner@example.com",
      subject: "AI Tutor 邮箱验证码",
      text: "AI Tutor 邮箱验证码：123456。验证码 10 分钟内有效。",
      html: expect.stringContaining("AI Tutor 邮箱验证码"),
      templateAlias: "verification_otp",
      templateData: {
        appName: "AI Tutor",
        loginText: "AI Tutor 邮箱验证码",
        otp: "123456",
        expiresInMinutes: 10,
      },
    });
  });
});
