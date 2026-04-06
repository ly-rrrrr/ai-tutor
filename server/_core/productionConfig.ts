import { isValidSmtpPort } from "./email";
import { ENV } from "./env";

export function assertProductionConfig() {
  if (!ENV.isProduction) {
    return;
  }

  const missing: string[] = [];

  if (!ENV.appOrigin.startsWith("https://")) {
    missing.push("APP_ORIGIN(https)");
  }

  if (!ENV.databaseUrl) {
    missing.push("DATABASE_URL");
  }

  if (!ENV.betterAuthSecret) {
    missing.push("BETTER_AUTH_SECRET");
  }

  if (!ENV.aiApiKey) {
    missing.push("AI_API_KEY");
  }

  if (!ENV.s3Endpoint) {
    missing.push("S3_ENDPOINT");
  }

  if (!ENV.s3Bucket) {
    missing.push("S3_BUCKET");
  }

  if (!ENV.s3AccessKeyId) {
    missing.push("S3_ACCESS_KEY_ID");
  }

  if (!ENV.s3SecretAccessKey) {
    missing.push("S3_SECRET_ACCESS_KEY");
  }

  if (!ENV.smtpHost) {
    missing.push("SMTP_HOST");
  }

  if (!ENV.smtpUser) {
    missing.push("SMTP_USER");
  }

  if (!ENV.smtpPass) {
    missing.push("SMTP_PASS");
  }

  if (!ENV.smtpFromEmail) {
    missing.push("SMTP_FROM_EMAIL");
  }

  if (!isValidSmtpPort(ENV.smtpPort)) {
    missing.push("SMTP_PORT");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required production configuration: ${missing.join(", ")}`
    );
  }
}
