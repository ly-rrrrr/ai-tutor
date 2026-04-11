import crypto from "crypto";
import { ENV } from "./env";

export type EmailTemplateAlias = "verification_otp" | "admin_notification";

type TemplateValue = string | number | boolean | null | undefined;

export type TencentSesSendEmailParams = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  templateAlias?: EmailTemplateAlias;
  templateData?: Record<string, TemplateValue>;
};

const TENCENT_SES_HOST = "ses.tencentcloudapi.com";
const TENCENT_SES_VERSION = "2020-10-02";
const TENCENT_SES_SERVICE = "ses";
const TENCENT_SES_ACTION = "SendEmail";

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256(key: string | Buffer, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function normalizeTemplateData(
  data: Record<string, TemplateValue> | undefined
): Record<string, string | number | boolean | null> {
  if (!data) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value == null ? null : value])
  );
}

function getTemplateId(alias: EmailTemplateAlias | undefined): number | null {
  if (!alias) {
    return null;
  }

  switch (alias) {
    case "verification_otp":
      return ENV.tencentSesVerificationOtpTemplateId;
    case "admin_notification":
      return ENV.tencentSesAdminNotificationTemplateId;
    default:
      return null;
  }
}

function buildPayload(params: TencentSesSendEmailParams) {
  const payload: Record<string, unknown> = {
    FromEmailAddress: params.from,
    Destination: params.to,
    Subject: params.subject,
  };

  if (params.replyTo) {
    payload.ReplyToAddresses = [params.replyTo];
  }

  if (ENV.tencentSesAllowSimpleContent) {
    payload.Simple = {
      Html: Buffer.from(params.html, "utf8").toString("base64"),
      Text: Buffer.from(params.text ?? "", "utf8").toString("base64"),
    };
    return payload;
  }

  const templateId = getTemplateId(params.templateAlias);

  if (!templateId) {
    throw new Error(
      `Tencent SES template ID is not configured for ${params.templateAlias ?? "this email type"}`
    );
  }

  payload.Template = {
    TemplateID: templateId,
    TemplateData: JSON.stringify(normalizeTemplateData(params.templateData)),
  };

  return payload;
}

function buildAuthorization(payload: string, timestamp: number): string {
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const signedHeaders = "content-type;host";
  const canonicalHeaders =
    "content-type:application/json; charset=utf-8\n" +
    `host:${TENCENT_SES_HOST}\n`;
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(payload),
  ].join("\n");
  const credentialScope = `${date}/${TENCENT_SES_SERVICE}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const secretDate = hmacSha256(`TC3${ENV.tencentSesSecretKey}`, date);
  const secretService = hmacSha256(secretDate, TENCENT_SES_SERVICE);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = crypto
    .createHmac("sha256", secretSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  return [
    "TC3-HMAC-SHA256",
    `Credential=${ENV.tencentSesSecretId}/${credentialScope},`,
    `SignedHeaders=${signedHeaders},`,
    `Signature=${signature}`,
  ].join(" ");
}

export async function sendTencentSesEmail(
  params: TencentSesSendEmailParams
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify(buildPayload(params));
  const response = await fetch(`https://${TENCENT_SES_HOST}`, {
    method: "POST",
    headers: {
      Authorization: buildAuthorization(payload, timestamp),
      "Content-Type": "application/json; charset=utf-8",
      Host: TENCENT_SES_HOST,
      "X-TC-Action": TENCENT_SES_ACTION,
      "X-TC-Region": ENV.tencentSesRegion,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": TENCENT_SES_VERSION,
    },
    body: payload,
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Tencent SES request failed (${response.status} ${response.statusText})`
    );
  }

  const apiError = result?.Response?.Error;

  if (apiError) {
    throw new Error(
      `Tencent SES send failed (${apiError.Code}): ${apiError.Message}`
    );
  }
}
