import { TRPCError } from "@trpc/server";
import { ENV } from "./env";
import { assertEmailConfigured, sendEmail } from "./email";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Dispatches an admin notification email through SMTP.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  if (!ENV.adminEmail) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "ADMIN_EMAIL is not configured.",
    });
  }

  try {
    assertEmailConfigured();
  } catch (error) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        error instanceof Error ? error.message : "SMTP email service is not configured.",
    });
  }

  try {
    await sendEmail({
      to: ENV.adminEmail,
      subject: title,
      text: content,
      html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${content}</pre>`,
    });

    return true;
  } catch (error) {
    console.warn("[Notification] Error sending admin email:", error);
    return false;
  }
}
