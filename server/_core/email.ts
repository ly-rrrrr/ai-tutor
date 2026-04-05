import nodemailer from "nodemailer";
import { ENV } from "./env";

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;

export function assertEmailConfigured(): void {
  const required = [
    ["SMTP_HOST", ENV.smtpHost],
    ["SMTP_USER", ENV.smtpUser],
    ["SMTP_PASS", ENV.smtpPass],
    ["SMTP_FROM_EMAIL", ENV.smtpFromEmail],
  ] as const;

  for (const [name, value] of required) {
    if (!value) {
      throw new Error(`${name} is not configured`);
    }
  }
}

function getTransport() {
  assertEmailConfigured();

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

export async function sendEmail(params: SendEmailParams): Promise<void> {
  await getTransport().sendMail({
    from: ENV.smtpFromEmail,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
}
