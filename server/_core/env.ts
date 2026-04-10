const hasExplicitAiProviderEnv =
  Boolean(process.env.AI_BASE_URL) || Boolean(process.env.AI_API_KEY);

const hasAnyLegacyOpenAiEnv =
  Boolean(process.env.OPENAI_API_KEY) ||
  Boolean(process.env.OPENAI_CHAT_MODEL) ||
  Boolean(process.env.OPENAI_STT_MODEL) ||
  Boolean(process.env.OPENAI_TTS_MODEL);

const isLegacyOpenAiCompatibilityPath =
  !hasExplicitAiProviderEnv && hasAnyLegacyOpenAiEnv;
const resolvedAiBaseUrl =
  process.env.AI_BASE_URL ||
  (isLegacyOpenAiCompatibilityPath
    ? "https://api.openai.com/v1"
    : "https://aihubmix.com/v1");
const normalizedAiBaseUrl = resolvedAiBaseUrl.replace(/\/+$/, "");
const defaultAiChatModel =
  normalizedAiBaseUrl === "https://api.openai.com/v1"
    ? "gpt-4o-mini"
    : "gemini-2.5-flash-lite";

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parseOptionalPositiveInteger(
  value: string | undefined
): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export const ENV = {
  appOrigin: process.env.APP_ORIGIN ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL ?? "",
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? "",
  adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: (process.env.NODE_ENV ?? "development") === "development",
  aiBaseUrl: resolvedAiBaseUrl,
  aiApiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "",
  aiChatModel:
    process.env.AI_CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || defaultAiChatModel,
  aiSttModel:
    process.env.AI_STT_MODEL || process.env.OPENAI_STT_MODEL || "whisper-1",
  aiTtsModel:
    process.env.AI_TTS_MODEL ||
    process.env.OPENAI_TTS_MODEL ||
    "gpt-4o-mini-tts",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Region: process.env.S3_REGION || process.env.AWS_REGION || "ap-hongkong",
  s3Bucket: process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || "",
  s3AccessKeyId:
    process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
  s3SecretAccessKey:
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    "",
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? "587"),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFromEmail: process.env.EMAIL_FROM ?? process.env.SMTP_FROM_EMAIL ?? "",
  emailProvider: process.env.EMAIL_PROVIDER ?? "smtp",
  emailFrom:
    process.env.EMAIL_FROM ??
    process.env.SMTP_FROM_EMAIL ??
    process.env.RESEND_FROM_EMAIL ??
    "",
  emailReplyTo: process.env.EMAIL_REPLY_TO ?? "",
  tencentSesSecretId: process.env.TENCENT_SES_SECRET_ID ?? "",
  tencentSesSecretKey: process.env.TENCENT_SES_SECRET_KEY ?? "",
  tencentSesRegion: process.env.TENCENT_SES_REGION ?? "",
  tencentSesAllowSimpleContent: parseBooleanEnv(
    process.env.TENCENT_SES_ALLOW_SIMPLE_CONTENT
  ),
  tencentSesMagicLinkTemplateId: parseOptionalPositiveInteger(
    process.env.TENCENT_SES_MAGIC_LINK_TEMPLATE_ID
  ),
  tencentSesAdminNotificationTemplateId: parseOptionalPositiveInteger(
    process.env.TENCENT_SES_ADMIN_NOTIFICATION_TEMPLATE_ID
  ),
  openAiApiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "",
  openAiChatModel:
    process.env.AI_CHAT_MODEL || process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
  openAiSttModel:
    process.env.AI_STT_MODEL || process.env.OPENAI_STT_MODEL || "whisper-1",
  openAiTtsModel:
    process.env.AI_TTS_MODEL ||
    process.env.OPENAI_TTS_MODEL ||
    "gpt-4o-mini-tts",
  awsRegion: process.env.S3_REGION || process.env.AWS_REGION || "ap-southeast-1",
  awsS3Bucket: process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || "",
  awsAccessKeyId:
    process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
  awsSecretAccessKey:
    process.env.S3_SECRET_ACCESS_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail:
    process.env.RESEND_FROM_EMAIL ??
    process.env.EMAIL_FROM ??
    process.env.SMTP_FROM_EMAIL ??
    "",
};
