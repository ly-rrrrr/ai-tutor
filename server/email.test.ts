import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const fetchMock = vi.fn();

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
  vi.stubGlobal("fetch", fetchMock);
  process.env = {
    ...ORIGINAL_ENV,
    EMAIL_PROVIDER: "smtp",
    EMAIL_FROM: "AI Tutor <noreply@example.com>",
    SMTP_HOST: "smtp.example.com",
    SMTP_PORT: "587",
    SMTP_USER: "mailer-user",
    SMTP_PASS: "mailer-pass",
    SMTP_FROM_EMAIL: "AI Tutor <noreply@example.com>",
    TENCENT_SES_REGION: "ap-guangzhou",
    TENCENT_SES_SECRET_ID: "secret-id",
    TENCENT_SES_SECRET_KEY: "secret-key",
    TENCENT_SES_VERIFICATION_OTP_TEMPLATE_ID: "1001",
    TENCENT_SES_ADMIN_NOTIFICATION_TEMPLATE_ID: "1002",
  };
  delete process.env.TENCENT_SES_MAGIC_LINK_TEMPLATE_ID;
  delete process.env.TENCENT_SES_ALLOW_SIMPLE_CONTENT;
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  vi.unstubAllGlobals();
});

describe("email", () => {
  it("throws when required smtp configuration is missing", async () => {
    delete process.env.SMTP_PASS;

    const { assertEmailConfigured } = await import("./_core/email");

    expect(() => assertEmailConfigured()).toThrow("SMTP_PASS is not configured");
  });

  it("throws when smtp port is invalid", async () => {
    process.env.SMTP_PORT = "not-a-number";

    const { assertEmailConfigured } = await import("./_core/email");

    expect(() => assertEmailConfigured()).toThrow("SMTP_PORT is invalid");
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
      replyTo: undefined,
    });
  });

  it("allows email delivery to be disabled without failing configuration checks", async () => {
    process.env.EMAIL_PROVIDER = "disabled";
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const { assertEmailConfigured, sendEmail } = await import("./_core/email");

    expect(() => assertEmailConfigured()).not.toThrow();
    await expect(
      sendEmail({
        to: "learner@example.com",
        subject: "Disabled email",
        html: "<p>Disabled</p>",
      })
    ).rejects.toThrow("Email delivery is disabled");
  });

  it("sends verification otp email through Tencent SES API with the otp template contract", async () => {
    process.env.EMAIL_PROVIDER = "tencent_ses_api";
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        Response: {
          MessageId: "test-message-id",
        },
      }),
    });

    const { sendEmail } = await import("./_core/email");

    await sendEmail({
      to: "learner@example.com",
      subject: "AI Tutor 邮箱验证码",
      text: "AI Tutor 邮箱验证码：123456。验证码 10 分钟内有效。",
      html: "<p>AI Tutor 邮箱验证码：123456。验证码 10 分钟内有效。</p>",
      templateAlias: "verification_otp",
      templateData: {
        appName: "AI Tutor",
        loginText: "AI Tutor 邮箱验证码",
        otp: "123456",
        expiresInMinutes: 10,
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, request] = fetchMock.mock.calls[0];
    const payload = JSON.parse(String(request?.body));

    expect(request?.headers).toMatchObject({
      "Content-Type": "application/json; charset=utf-8",
      Host: "ses.tencentcloudapi.com",
      "X-TC-Action": "SendEmail",
      "X-TC-Region": "ap-guangzhou",
      "X-TC-Version": "2020-10-02",
    });
    expect(payload).toMatchObject({
      FromEmailAddress: "AI Tutor <noreply@example.com>",
      Destination: ["learner@example.com"],
      Subject: "AI Tutor 邮箱验证码",
      Template: {
        TemplateID: 1001,
      },
    });
    expect(JSON.parse(payload.Template.TemplateData)).toMatchObject({
      appName: "AI Tutor",
      loginText: "AI Tutor 邮箱验证码",
      otp: "123456",
      expiresInMinutes: 10,
    });
    expect(JSON.parse(payload.Template.TemplateData)).not.toHaveProperty("url");
  });

  it("requires a Tencent SES verification OTP template ID when simple content mode is disabled", async () => {
    process.env.EMAIL_PROVIDER = "tencent_ses_api";
    delete process.env.TENCENT_SES_VERIFICATION_OTP_TEMPLATE_ID;

    const { assertEmailConfigured } = await import("./_core/email");

    expect(() => assertEmailConfigured()).toThrow(
      "TENCENT_SES_VERIFICATION_OTP_TEMPLATE_ID is not configured"
    );
  });

  it("allows Tencent SES simple content mode without a template ID", async () => {
    process.env.EMAIL_PROVIDER = "tencent_ses_api";
    process.env.TENCENT_SES_ALLOW_SIMPLE_CONTENT = "true";
    delete process.env.TENCENT_SES_VERIFICATION_OTP_TEMPLATE_ID;

    const { assertEmailConfigured } = await import("./_core/email");

    expect(() => assertEmailConfigured()).not.toThrow();
  });
});
