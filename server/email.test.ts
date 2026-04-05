import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail,
    })),
  },
}));

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env = {
    ...ORIGINAL_ENV,
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_USER: "mailer-user",
    SMTP_PASS: "mailer-pass",
    SMTP_FROM_EMAIL: "AI Tutor <noreply@example.com>",
  };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("email", () => {
  it("throws when required smtp configuration is missing", async () => {
    delete process.env.SMTP_PASS;

    const { assertEmailConfigured } = await import("./_core/email");

    expect(() => assertEmailConfigured()).toThrow("SMTP_PASS is not configured");
  });

  it("sends email through smtp with normalized recipients", async () => {
    const nodemailer = await import("nodemailer");
    const { sendEmail } = await import("./_core/email");

    await sendEmail({
      to: ["learner@example.com", "coach@example.com"],
      subject: "Sign in to AI Tutor",
      text: "Your magic link",
      html: "<p>Your magic link</p>",
    });

    expect(nodemailer.default.createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: {
        user: "mailer-user",
        pass: "mailer-pass",
      },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: "AI Tutor <noreply@example.com>",
      to: ["learner@example.com", "coach@example.com"],
      subject: "Sign in to AI Tutor",
      text: "Your magic link",
      html: "<p>Your magic link</p>",
    });
  });
});
