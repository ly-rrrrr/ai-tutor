import nodemailer from "nodemailer";
import { ENV } from "./env";
import {
  sendTencentSesEmail,
  type EmailTemplateAlias,
} from "./tencentSes";

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  templateAlias?: EmailTemplateAlias;
  templateData?: Record<string, string | number | boolean | null | undefined>;
};

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

export function isValidSmtpPort(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 65535;
}

function getEmailProvider() {
  return ENV.emailProvider.trim().toLowerCase();
}

function assertSmtpConfigured(): void {
  const required = [
    ["SMTP_HOST", ENV.smtpHost],
    ["SMTP_USER", ENV.smtpUser],
    ["SMTP_PASS", ENV.smtpPass],
    ["EMAIL_FROM", ENV.emailFrom],
  ] as const;

  for (const [name, value] of required) {
    if (!value) {
      throw new Error(`${name} is not configured`);
    }
  }

  if (!isValidSmtpPort(ENV.smtpPort)) {
    throw new Error("SMTP_PORT is invalid");
  }
}

function assertTencentSesConfigured(): void {
  const required = [
    ["TENCENT_SES_SECRET_ID", ENV.tencentSesSecretId],
    ["TENCENT_SES_SECRET_KEY", ENV.tencentSesSecretKey],
    ["TENCENT_SES_REGION", ENV.tencentSesRegion],
    ["EMAIL_FROM", ENV.emailFrom],
  ] as const;

  for (const [name, value] of required) {
    if (!value) {
      throw new Error(`${name} is not configured`);
    }
  }

  if (
    !ENV.tencentSesAllowSimpleContent &&
    !ENV.tencentSesMagicLinkTemplateId
  ) {
    throw new Error(
      "TENCENT_SES_MAGIC_LINK_TEMPLATE_ID is not configured and simple content mode is disabled"
    );
  }
}

export function assertEmailConfigured(): void {
  switch (getEmailProvider()) {
    case "disabled":
      return;
    case "smtp":
      assertSmtpConfigured();
      return;
    case "tencent_ses_api":
      assertTencentSesConfigured();
      return;
    default:
      throw new Error(
        "EMAIL_PROVIDER must be one of: disabled, smtp, tencent_ses_api"
      );
  }
}

function getTransport() {
  assertSmtpConfigured();

  if (transport) {
    return transport;
  }

  transport = nodemailer.createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: ENV.smtpPort === 465,
    auth: {
      user: ENV.smtpUser,
      pass: ENV.smtpPass,
    },
  });

  return transport;
}

function normalizeRecipients(value: string | string[]) {
  return Array.isArray(value) ? value : [value];
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const recipients = normalizeRecipients(params.to);

  switch (getEmailProvider()) {
    case "disabled":
      throw new Error("Email delivery is disabled");
    case "smtp":
      await getTransport().sendMail({
        from: ENV.emailFrom,
        to: recipients,
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo: ENV.emailReplyTo || undefined,
      });
      return;
    case "tencent_ses_api":
      assertTencentSesConfigured();
      await sendTencentSesEmail({
        from: ENV.emailFrom,
        to: recipients,
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo: ENV.emailReplyTo || undefined,
        templateAlias: params.templateAlias,
        templateData: params.templateData,
      });
      return;
    default:
      throw new Error(
        "EMAIL_PROVIDER must be one of: disabled, smtp, tencent_ses_api"
      );
  }
}
