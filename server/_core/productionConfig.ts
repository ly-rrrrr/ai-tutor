import { isValidSmtpPort } from "./email";
import { ENV } from "./env";

function hasProviderNeutralStorageEnv() {
  return Boolean(
    process.env.S3_ENDPOINT ||
      process.env.S3_ACCESS_KEY_ID ||
      process.env.S3_SECRET_ACCESS_KEY
  );
}

function hasLegacyAwsStorageEnv() {
  return Boolean(
    process.env.AWS_REGION ||
      process.env.AWS_S3_BUCKET ||
      process.env.AWS_ACCESS_KEY_ID ||
      process.env.AWS_SECRET_ACCESS_KEY
  );
}

function getStorageDriver() {
  return ENV.storageDriver;
}

function getEmailProvider() {
  return ENV.emailProvider.trim().toLowerCase();
}

function isAuthEnabled() {
  return getEmailProvider() !== "disabled";
}

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

  if (isAuthEnabled()) {
    if (!ENV.turnstileSiteKey) {
      missing.push("CLOUDFLARE_TURNSTILE_SITE_KEY");
    }

    if (!ENV.turnstileSecretKey) {
      missing.push("CLOUDFLARE_TURNSTILE_SECRET_KEY");
    }
  }

  switch (getStorageDriver()) {
    case "local":
      if (!ENV.localStorageDir) {
        missing.push("LOCAL_STORAGE_DIR");
      }
      break;
    case "s3":
      if (hasProviderNeutralStorageEnv()) {
        if (!ENV.s3Endpoint) {
          missing.push("S3_ENDPOINT");
        }

        if (!(process.env.S3_REGION || process.env.AWS_REGION)) {
          missing.push("S3_REGION");
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
      } else if (hasLegacyAwsStorageEnv()) {
        if (!(process.env.AWS_REGION || process.env.S3_REGION)) {
          missing.push("AWS_REGION");
        }

        if (!ENV.awsS3Bucket) {
          missing.push("AWS_S3_BUCKET");
        }

        if (!ENV.awsAccessKeyId) {
          missing.push("AWS_ACCESS_KEY_ID");
        }

        if (!ENV.awsSecretAccessKey) {
          missing.push("AWS_SECRET_ACCESS_KEY");
        }
      } else {
        missing.push(
          "S3_ENDPOINT",
          "S3_REGION",
          "S3_BUCKET",
          "S3_ACCESS_KEY_ID",
          "S3_SECRET_ACCESS_KEY"
        );
      }
      break;
    default:
      missing.push("STORAGE_DRIVER(local|s3)");
      break;
  }

  switch (getEmailProvider()) {
    case "disabled":
      break;
    case "smtp":
      if (!ENV.emailFrom) {
        missing.push("EMAIL_FROM");
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

      if (!isValidSmtpPort(ENV.smtpPort)) {
        missing.push("SMTP_PORT");
      }
      break;
    case "tencent_ses_api":
      if (!ENV.emailFrom) {
        missing.push("EMAIL_FROM");
      }

      if (!ENV.tencentSesSecretId) {
        missing.push("TENCENT_SES_SECRET_ID");
      }

      if (!ENV.tencentSesSecretKey) {
        missing.push("TENCENT_SES_SECRET_KEY");
      }

      if (!ENV.tencentSesRegion) {
        missing.push("TENCENT_SES_REGION");
      }

      if (
        !ENV.tencentSesAllowSimpleContent &&
        !ENV.tencentSesVerificationOtpTemplateId
      ) {
        missing.push("TENCENT_SES_VERIFICATION_OTP_TEMPLATE_ID");
      }
      break;
    default:
      missing.push("EMAIL_PROVIDER(disabled|smtp|tencent_ses_api)");
      break;
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required production configuration: ${missing.join(", ")}`
    );
  }
}
