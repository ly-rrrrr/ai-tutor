# AI Tutor HK Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current AI Tutor codebase into a Hong Kong-hosted public trial deployment that uses AiHubMix, Tencent COS, Tencent SES SMTP, and same-host MySQL without demo-mode production fallbacks.

**Architecture:** Keep the single Node/Express application and current Vite frontend, but replace provider-specific integrations with deployment-neutral adapters and enforce production startup guards. Store audio object keys instead of expiring signed URLs, add low-cost in-process rate limiting, and ship the app with Docker Compose plus Caddy for HTTPS.

**Tech Stack:** TypeScript, Express, tRPC, Better Auth, Drizzle ORM, MySQL 8, AWS S3 SDK against Tencent COS, Nodemailer SMTP, Vite, React, Vitest, Docker Compose, Caddy

---

Current workspace note: this folder does not contain `.git`, so the checkpoint steps below should be treated as "run if the implementation workspace is attached to git". The commit messages are still provided so the work can be replayed cleanly in a real git checkout.

## File Structure

**Create**

- `server/_core/aiGateway.ts`
  Responsibility: normalize OpenAI-compatible gateway URLs and shared auth headers for AiHubMix-backed chat/STT/TTS calls.
- `server/_core/email.ts`
  Responsibility: send transactional email through SMTP and expose a single configuration check for auth startup.
- `server/_core/productionConfig.ts`
  Responsibility: validate required production-only environment variables and throw before the server starts.
- `server/_core/rateLimit.ts`
  Responsibility: implement in-memory fixed-window limiters plus reset hooks for tests.
- `server/aiGateway.test.ts`
  Responsibility: cover AiHubMix base URL normalization and shared AI config guards.
- `server/email.test.ts`
  Responsibility: cover SMTP sender behavior and required SMTP environment validation.
- `server/audioPersistence.test.ts`
  Responsibility: cover object-key persistence, signed URL resolution, and assistant TTS caching.
- `server/productionConfig.test.ts`
  Responsibility: cover fail-fast production config validation.
- `server/rateLimit.test.ts`
  Responsibility: cover fixed-window limiter behavior and reset logic.
- `client/src/lib/routes.ts`
  Responsibility: hold absolute app route helpers so navigation is not duplicated or `~/...`-dependent.
- `client/src/lib/routes.test.ts`
  Responsibility: verify route helper output for chat list and conversation detail paths.
- `docker-compose.yml`
  Responsibility: define `app`, `mysql`, and `caddy` services for the Hong Kong single-host deployment.
- `Caddyfile`
  Responsibility: terminate HTTPS and reverse proxy requests to the app container.
- `.env.production.example`
  Responsibility: document required production variables for AiHubMix, COS, SMTP, MySQL, and auth.
- `docs/deployment/tencent-cloud-hk-lighthouse.md`
  Responsibility: provide the exact server provisioning, DNS, deployment, migration, and smoke-test procedure.

**Modify**

- `package.json`
  Responsibility: add SMTP dependency and scripts useful for migration/deployment execution.
- `.env.example`
  Responsibility: replace OpenAI/AWS/Resend-specific names with provider-neutral AI/S3/SMTP settings.
- `server/_core/env.ts`
  Responsibility: expose normalized AI, S3, SMTP, and environment mode configuration.
- `server/_core/llm.ts`
  Responsibility: send chat completions through the AiHubMix-compatible gateway.
- `server/_core/tts.ts`
  Responsibility: send speech synthesis requests through the same AI gateway configuration.
- `server/_core/voiceTranscription.ts`
  Responsibility: transcribe audio through the configured gateway instead of hardcoded OpenAI URLs.
- `server/_core/auth.ts`
  Responsibility: switch auth email sending to SMTP, strengthen auth config checks, and plug in login request rate limiting.
- `server/_core/index.ts`
  Responsibility: enforce production config validation, register `/healthz`, trust Caddy proxy headers, and wire middleware in the correct order.
- `server/storage.ts`
  Responsibility: target generic S3-compatible storage with custom endpoint support and signed URL helpers.
- `drizzle/schema.ts`
  Responsibility: add audio object-key columns required for durable playback.
- `server/db.ts`
  Responsibility: remove production fallback behavior and persist audio object metadata.
- `server/routers.ts`
  Responsibility: accept audio keys, return assistant message IDs, persist TTS object keys, resolve signed URLs on reads, and enforce trial quotas.
- `server/features.test.ts`
  Responsibility: update mocks and router expectations for audio keys, assistant message IDs, and provider-neutral env names.
- `client/src/pages/Chat.tsx`
  Responsibility: use absolute route helpers when creating a conversation.
- `client/src/pages/Explore.tsx`
  Responsibility: use absolute route helpers for navigation and conversation start.
- `client/src/pages/Courses.tsx`
  Responsibility: use absolute route helpers for conversation start.
- `client/src/pages/History.tsx`
  Responsibility: use absolute route helpers for conversation detail navigation.
- `client/src/pages/ConversationDetail.tsx`
  Responsibility: send audio keys instead of signed URLs, cache assistant message IDs, and hydrate persisted TTS URLs from the API.
- `client/src/components/DashboardLayout.tsx`
  Responsibility: stop relying on `~/app` path conventions and use explicit absolute app routes.

### Task 1: Introduce Provider-Neutral AI Configuration

**Files:**
- Create: `server/_core/aiGateway.ts`
- Create: `server/aiGateway.test.ts`
- Modify: `server/_core/env.ts`
- Modify: `server/_core/llm.ts`
- Modify: `server/_core/tts.ts`
- Modify: `server/_core/voiceTranscription.ts`
- Modify: `.env.example`
- Test: `server/aiGateway.test.ts`

- [ ] **Step 1: Write the failing AI gateway tests**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("ai gateway config", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;
  });

  it("normalizes the configured base URL for chat completions", async () => {
    process.env.AI_BASE_URL = "https://aihubmix.com/v1/";
    process.env.AI_API_KEY = "test-key";

    const { buildAiGatewayUrl } = await import("./_core/aiGateway");

    expect(buildAiGatewayUrl("/chat/completions")).toBe(
      "https://aihubmix.com/v1/chat/completions"
    );
  });

  it("throws when the AI gateway is missing an API key", async () => {
    process.env.AI_BASE_URL = "https://aihubmix.com/v1";

    const { assertAiGatewayConfigured } = await import("./_core/aiGateway");

    expect(() => assertAiGatewayConfigured()).toThrow(
      "AI_API_KEY is not configured"
    );
  });
});
```

- [ ] **Step 2: Run the AI gateway test to verify it fails**

Run: `pnpm.cmd test -- server/aiGateway.test.ts`

Expected: FAIL with `Cannot find module './_core/aiGateway'` or missing export errors.

- [ ] **Step 3: Create the shared AI gateway helper**

```ts
import { ENV } from "./env";

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function assertAiGatewayConfigured() {
  if (!ENV.aiBaseUrl) {
    throw new Error("AI_BASE_URL is not configured");
  }

  if (!ENV.aiApiKey) {
    throw new Error("AI_API_KEY is not configured");
  }
}

export function buildAiGatewayUrl(path: string) {
  assertAiGatewayConfigured();
  const normalizedPath = path.replace(/^\/+/, "");
  return `${normalizeBaseUrl(ENV.aiBaseUrl)}/${normalizedPath}`;
}

export function getAiGatewayHeaders(extra: Record<string, string> = {}) {
  assertAiGatewayConfigured();
  return {
    authorization: `Bearer ${ENV.aiApiKey}`,
    ...extra,
  };
}
```

- [ ] **Step 4: Expand the environment contract to AI, S3, and SMTP names**

```ts
export const ENV = {
  appOrigin: process.env.APP_ORIGIN ?? "http://localhost:3000",
  databaseUrl: process.env.DATABASE_URL ?? "",
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? "",
  adminEmail: process.env.ADMIN_EMAIL?.trim().toLowerCase() ?? "",
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: (process.env.NODE_ENV ?? "development") === "development",
  aiBaseUrl: process.env.AI_BASE_URL ?? "https://aihubmix.com/v1",
  aiApiKey: process.env.AI_API_KEY ?? "",
  aiChatModel: process.env.AI_CHAT_MODEL ?? "gemini-2.5-flash-lite",
  aiSttModel: process.env.AI_STT_MODEL ?? "whisper-1",
  aiTtsModel: process.env.AI_TTS_MODEL ?? "gpt-4o-mini-tts",
  s3Endpoint: process.env.S3_ENDPOINT ?? "",
  s3Region: process.env.S3_REGION ?? "ap-hongkong",
  s3Bucket: process.env.S3_BUCKET ?? "",
  s3AccessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
  s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
  s3PublicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? "",
  smtpHost: process.env.SMTP_HOST ?? "",
  smtpPort: Number(process.env.SMTP_PORT ?? "587"),
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFromEmail: process.env.SMTP_FROM_EMAIL ?? "",
};
```

- [ ] **Step 5: Point the LLM client at the shared AI gateway**

```ts
import { buildAiGatewayUrl, getAiGatewayHeaders } from "./aiGateway";

const resolveApiUrl = () => buildAiGatewayUrl("/chat/completions");

const assertApiKey = () => {
  if (!ENV.aiApiKey) {
    throw new Error("AI_API_KEY is not configured");
  }
};

const payload: Record<string, unknown> = {
  model: ENV.aiChatModel,
  messages: messages.map(normalizeMessage),
  max_tokens: maxTokens ?? max_tokens ?? 4096,
};

const response = await fetch(resolveApiUrl(), {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...getAiGatewayHeaders(),
  },
  body: JSON.stringify(payload),
});
```

- [ ] **Step 6: Point TTS and transcription at the same gateway contract**

```ts
const response = await fetch(buildAiGatewayUrl("/audio/speech"), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...getAiGatewayHeaders(),
  },
  body: JSON.stringify({
    model: options.model || ENV.aiTtsModel,
    input: text,
    voice: selectedVoice,
    speed: options.speed || 1.0,
    response_format: format,
  }),
});
```

```ts
formData.append("model", ENV.aiSttModel);

const response = await fetch(buildAiGatewayUrl("/audio/transcriptions"), {
  method: "POST",
  headers: getAiGatewayHeaders(),
  body: formData,
});
```

- [ ] **Step 7: Replace the provider examples in `.env.example`**

```env
APP_ORIGIN=https://app.example.com
DATABASE_URL=mysql://ai_tutor:replace-me@mysql:3306/ai_tutor
BETTER_AUTH_SECRET=replace-with-a-long-random-secret
ADMIN_EMAIL=owner@example.com
AI_BASE_URL=https://aihubmix.com/v1
AI_API_KEY=replace-me
AI_CHAT_MODEL=gemini-2.5-flash-lite
AI_STT_MODEL=whisper-1
AI_TTS_MODEL=gpt-4o-mini-tts
S3_ENDPOINT=https://cos.ap-hongkong.myqcloud.com
S3_REGION=ap-hongkong
S3_BUCKET=ai-tutor-audio-1250000000
S3_ACCESS_KEY_ID=replace-me
S3_SECRET_ACCESS_KEY=replace-me
SMTP_HOST=smtp.qcloudmail.com
SMTP_PORT=587
SMTP_USER=replace-me
SMTP_PASS=replace-me
SMTP_FROM_EMAIL=AI Tutor <noreply@example.com>
NODE_ENV=production
```

- [ ] **Step 8: Run the targeted AI tests**

Run: `pnpm.cmd test -- server/aiGateway.test.ts server/features.test.ts`

Expected: PASS for the new gateway tests and PASS for the existing router suite after env name updates.

- [ ] **Step 9: Checkpoint this task**

If the implementation workspace is attached to git:

```bash
git add .env.example server/_core/env.ts server/_core/aiGateway.ts server/_core/llm.ts server/_core/tts.ts server/_core/voiceTranscription.ts server/aiGateway.test.ts server/features.test.ts
git commit -m "refactor: add provider-neutral AI gateway config"
```

### Task 2: Replace Resend with SMTP Email Delivery

**Files:**
- Create: `server/_core/email.ts`
- Create: `server/email.test.ts`
- Modify: `package.json`
- Modify: `server/_core/auth.ts`
- Modify: `.env.example`
- Modify: `server/features.test.ts`
- Test: `server/email.test.ts`

- [ ] **Step 1: Write the failing SMTP sender test**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));

vi.mock("nodemailer", () => ({
  default: {
    createTransport,
  },
}));

describe("smtp email sender", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMail.mockReset();
    createTransport.mockClear();
    process.env.SMTP_HOST = "smtp.qcloudmail.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "smtp-user";
    process.env.SMTP_PASS = "smtp-pass";
    process.env.SMTP_FROM_EMAIL = "AI Tutor <noreply@example.com>";
  });

  it("sends email through nodemailer", async () => {
    sendMail.mockResolvedValue({ messageId: "abc" });
    const { sendEmail } = await import("./_core/email");

    await sendEmail({
      to: "learner@example.com",
      subject: "Sign in",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(createTransport).toHaveBeenCalled();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "AI Tutor <noreply@example.com>",
        to: ["learner@example.com"],
        subject: "Sign in",
      })
    );
  });
});
```

- [ ] **Step 2: Run the SMTP test to verify it fails**

Run: `pnpm.cmd test -- server/email.test.ts`

Expected: FAIL with `Cannot find package 'nodemailer'` or `Cannot find module './_core/email'`.

- [ ] **Step 3: Add Nodemailer and mail scripts**

```json
{
  "dependencies": {
    "nodemailer": "^6.10.0"
  },
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

- [ ] **Step 4: Create the SMTP sender**

```ts
import nodemailer from "nodemailer";
import { ENV } from "./env";

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export function assertEmailConfigured() {
  if (!ENV.smtpHost) throw new Error("SMTP_HOST is not configured");
  if (!ENV.smtpUser) throw new Error("SMTP_USER is not configured");
  if (!ENV.smtpPass) throw new Error("SMTP_PASS is not configured");
  if (!ENV.smtpFromEmail) throw new Error("SMTP_FROM_EMAIL is not configured");
}

function createTransport() {
  assertEmailConfigured();
  return nodemailer.createTransport({
    host: ENV.smtpHost,
    port: ENV.smtpPort,
    secure: ENV.smtpPort === 465,
    auth: {
      user: ENV.smtpUser,
      pass: ENV.smtpPass,
    },
  });
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const transport = createTransport();
  await transport.sendMail({
    from: ENV.smtpFromEmail,
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
}
```

- [ ] **Step 5: Rewire auth to use SMTP configuration**

```ts
import { assertEmailConfigured, sendEmail } from "./email";

function isAuthConfigured() {
  return Boolean(
    ENV.databaseUrl &&
    ENV.betterAuthSecret &&
    ENV.smtpHost &&
    ENV.smtpUser &&
    ENV.smtpPass &&
    ENV.smtpFromEmail
  );
}

export function assertAuthConfigured() {
  if (!ENV.databaseUrl) throw new Error("DATABASE_URL is required for auth");
  if (!ENV.betterAuthSecret) throw new Error("BETTER_AUTH_SECRET is required");
  assertEmailConfigured();
}
```

```ts
res.status(503).json({
  error:
    "Authentication is not configured. Set DATABASE_URL, BETTER_AUTH_SECRET, SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_FROM_EMAIL.",
});
```

- [ ] **Step 6: Update test mocks that still refer to Resend**

```ts
vi.mock("./_core/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  assertEmailConfigured: vi.fn(),
}));
```

- [ ] **Step 7: Run mailer and auth tests**

Run: `pnpm.cmd test -- server/email.test.ts server/features.test.ts server/auth.logout.test.ts`

Expected: PASS with SMTP-backed auth imports and unchanged logout behavior.

- [ ] **Step 8: Checkpoint this task**

If the implementation workspace is attached to git:

```bash
git add package.json pnpm-lock.yaml .env.example server/_core/email.ts server/_core/auth.ts server/email.test.ts server/features.test.ts
git commit -m "feat: switch auth mail delivery to smtp"
```

### Task 3: Persist Audio Object Keys Instead of Expiring URLs

**Files:**
- Create: `server/audioPersistence.test.ts`
- Modify: `drizzle/schema.ts`
- Modify: `server/storage.ts`
- Modify: `server/db.ts`
- Modify: `server/routers.ts`
- Modify: `client/src/pages/ConversationDetail.tsx`
- Modify: `server/features.test.ts`
- Test: `server/audioPersistence.test.ts`

- [ ] **Step 1: Write the failing audio persistence test**

```ts
import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";

vi.mock("./storage", () => ({
  storageGet: vi.fn().mockResolvedValue({
    key: "tts/assistant-1.mp3",
    url: "https://signed.example.com/tts/assistant-1.mp3",
  }),
  storagePut: vi.fn().mockResolvedValue({
    key: "tts/assistant-1.mp3",
    url: "https://signed.example.com/tts/assistant-1.mp3",
  }),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getConversationById: vi.fn().mockResolvedValue({
      id: 42,
      userId: 1,
      title: "Airport Check-in",
      status: "active",
    }),
    getConversationMessages: vi.fn().mockResolvedValue([
      {
        id: 7,
        conversationId: 42,
        role: "assistant",
        content: "Welcome back.",
        audioObjectKey: "tts/assistant-1.mp3",
        audioContentType: "audio/mpeg",
        createdAt: new Date(),
      },
    ]),
    updateMessage: vi.fn().mockResolvedValue(undefined),
  };
});

it("conversation.getById resolves signed audio URLs from stored object keys", async () => {
  const caller = appRouter.createCaller({
    user: {
      id: 1,
      authUserId: "user-1",
      email: "demo@example.com",
      name: "Demo",
      loginMethod: "magic_link",
      role: "user",
      level: "A2",
      totalPracticeSeconds: 0,
      totalConversations: 0,
      avgPronunciationScore: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    authSessionId: "session-1",
    req: { headers: {}, ip: "127.0.0.1" } as any,
    res: { clearCookie: vi.fn() } as any,
  });

  const result = await caller.conversation.getById({ id: 42 });

  expect(result.messages[0]).toMatchObject({
    audioUrl: "https://signed.example.com/tts/assistant-1.mp3",
  });
});
```

- [ ] **Step 2: Run the audio persistence test to verify it fails**

Run: `pnpm.cmd test -- server/audioPersistence.test.ts`

Expected: FAIL because `audioObjectKey` is not part of the current schema/API flow.

- [ ] **Step 3: Add durable audio columns to the message schema**

```ts
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  audioUrl: varchar("audioUrl", { length: 500 }),
  audioObjectKey: varchar("audioObjectKey", { length: 500 }),
  audioContentType: varchar("audioContentType", { length: 128 }),
  pronunciationScore: float("pronunciationScore"),
  pronunciationFeedback: json("pronunciationFeedback").$type<{
    accuracy: number;
    fluency: number;
    completeness: number;
    suggestions: string[];
  }>(),
  grammarCorrections: json("grammarCorrections").$type<Array<{
    original: string;
    corrected: string;
    explanation: string;
  }>>(),
  expressionSuggestions: json("expressionSuggestions").$type<Array<{
    original: string;
    better: string;
    reason: string;
  }>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
```

- [ ] **Step 4: Generate the Drizzle migration for the new message columns**

Run: `pnpm.cmd exec drizzle-kit generate --name audio_object_keys`

Expected: CREATE `drizzle/0003_audio_object_keys.sql` and the matching `drizzle/meta/0003_snapshot.json`.

- [ ] **Step 5: Make the storage layer generic and key-first**

```ts
if (
  !ENV.s3Endpoint ||
  !ENV.s3Region ||
  !ENV.s3Bucket ||
  !ENV.s3AccessKeyId ||
  !ENV.s3SecretAccessKey
) {
  throw new Error(
    "S3 storage is not configured. Set S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY."
  );
}

s3Client = new S3Client({
  region: ENV.s3Region,
  endpoint: ENV.s3Endpoint,
  credentials: {
    accessKeyId: ENV.s3AccessKeyId,
    secretAccessKey: ENV.s3SecretAccessKey,
  },
});
```

```ts
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const { bucket, client } = getStorageConfig();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: normalizeBody(data),
      ContentType: contentType,
    })
  );

  return {
    key,
    url: await storageGetSignedUrl(key),
  };
}

export async function storageGet(relKey: string) {
  const key = normalizeKey(relKey);
  return {
    key,
    url: await storageGetSignedUrl(key),
  };
}
```

- [ ] **Step 6: Update DB helpers and router APIs to pass audio keys**

```ts
voice: router({
  uploadAudio: protectedProcedure
    .input(z.object({
      audioBase64: z.string(),
      mimeType: z.string().default("audio/webm"),
    }))
    .mutation(async ({ input, ctx }) => {
      const buffer = Buffer.from(input.audioBase64, "base64");
      const ext = input.mimeType.includes("webm") ? "webm" : input.mimeType.includes("wav") ? "wav" : "mp3";
      const key = `audio/${ctx.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const result = await storagePut(key, buffer, input.mimeType);
      return { audioKey: result.key };
    }),
```

```ts
transcribe: protectedProcedure
  .input(z.object({
    audioKey: z.string(),
    language: z.string().default("en"),
  }))
  .mutation(async ({ input }) => {
    const { url } = await storageGet(input.audioKey);
    const result = await transcribeAudio({
      audioUrl: url,
      language: input.language,
      prompt: "Transcribe the English speech accurately.",
    });
```

```ts
send: protectedProcedure
  .input(z.object({
    conversationId: z.number(),
    content: z.string().min(1),
    audioKey: z.string().optional(),
  }))
  .mutation(async ({ input, ctx }) => {
    const userMessageId = await createMessage({
      conversationId: input.conversationId,
      role: "user",
      content: input.content,
      audioObjectKey: input.audioKey,
    });

    const assistantMessageId = await createMessage({
      conversationId: input.conversationId,
      role: "assistant",
      content: assistantContent,
    });

    return { content: assistantContent, userMessageId, assistantMessageId };
  }),
```

```ts
tts: protectedProcedure
  .input(z.object({
    text: z.string().min(1).max(4096),
    voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).default("nova"),
    speed: z.number().min(0.25).max(4.0).default(1.0),
    messageId: z.number().optional(),
  }))
  .mutation(async ({ input, ctx }) => {
    const result = await textToSpeech({ ...input });
    const key = `tts/${ctx.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
    const upload = await storagePut(key, result.audioBuffer, result.contentType);

    if (input.messageId) {
      await updateMessage(input.messageId, {
        audioObjectKey: upload.key,
        audioContentType: result.contentType,
      });
    }

    return { audioUrl: upload.url, audioKey: upload.key };
  }),
```

- [ ] **Step 7: Resolve signed URLs when reading conversations**

```ts
getById: protectedProcedure
  .input(z.object({ id: z.number() }))
  .query(async ({ input, ctx }) => {
    const conv = await getConversationById(input.id);
    if (!conv || conv.userId !== ctx.user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
    }

    const msgs = await getConversationMessages(input.id);
    const hydratedMessages = await Promise.all(
      msgs.map(async message => {
        if (!message.audioObjectKey) {
          return message;
        }

        const { url } = await storageGet(message.audioObjectKey);
        return {
          ...message,
          audioUrl: url,
        };
      })
    );

    return { conversation: conv, messages: hydratedMessages };
  }),
```

- [ ] **Step 8: Update the conversation page to use audio keys and persist assistant TTS**

```tsx
type DisplayMessage = {
  id?: number;
  role: "user" | "assistant" | "system";
  content: string;
  feedback?: FeedbackData | null;
  pronunciation?: PronunciationData | null;
  ttsUrl?: string | null;
  translation?: string | null;
};

const { audioKey } = await uploadAudio.mutateAsync({
  audioBase64: base64,
  mimeType: "audio/webm",
});
const { text } = await transcribe.mutateAsync({
  audioKey,
  language: "en",
});

sendMessage.mutateAsync({
  conversationId,
  content: text,
  audioKey,
}).then(result => {
  setDisplayMessages(prev => [
    ...prev,
    { id: result.assistantMessageId, role: "assistant", content: result.content },
  ]);
});
```

```tsx
const result = await ttsMutation.mutateAsync({
  text: cleanText,
  voice: "nova",
  speed: 0.9,
  messageId: displayMessages[msgIdx]?.id,
});
```

```tsx
useEffect(() => {
  if (data?.messages) {
    setDisplayMessages(
      data.messages
        .filter(m => m.role !== "system")
        .map(m => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          ttsUrl: m.role === "assistant" ? m.audioUrl ?? null : null,
        }))
    );
  }
}, [data]);
```

- [ ] **Step 9: Run the audio persistence test and the main router suite**

Run: `pnpm.cmd test -- server/audioPersistence.test.ts server/features.test.ts`

Expected: PASS with audio keys flowing through upload, transcription, TTS caching, and conversation hydration.

- [ ] **Step 10: Checkpoint this task**

If the implementation workspace is attached to git:

```bash
git add drizzle/schema.ts drizzle/0003_audio_object_keys.sql drizzle/meta/0003_snapshot.json server/storage.ts server/db.ts server/routers.ts server/audioPersistence.test.ts server/features.test.ts client/src/pages/ConversationDetail.tsx
git commit -m "feat: persist durable audio object keys"
```

### Task 4: Enforce Production Startup Guards and Low-Cost Trial Limits

**Files:**
- Create: `server/_core/productionConfig.ts`
- Create: `server/_core/rateLimit.ts`
- Create: `server/productionConfig.test.ts`
- Create: `server/rateLimit.test.ts`
- Modify: `server/_core/index.ts`
- Modify: `server/_core/auth.ts`
- Modify: `server/db.ts`
- Modify: `server/routers.ts`
- Modify: `server/features.test.ts`
- Test: `server/productionConfig.test.ts`
- Test: `server/rateLimit.test.ts`

- [ ] **Step 1: Write the failing production config and limiter tests**

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("production config", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = "production";
    process.env.AI_API_KEY = "";
  });

  it("fails fast when AI credentials are missing in production", async () => {
    const { assertProductionConfig } = await import("./_core/productionConfig");
    expect(() => assertProductionConfig()).toThrow("AI_API_KEY");
  });
});
```

```ts
import { describe, expect, it } from "vitest";
import { createFixedWindowLimiter } from "./_core/rateLimit";

describe("fixed window limiter", () => {
  it("blocks the third hit in a two-request window", () => {
    const limiter = createFixedWindowLimiter({ key: "chat", maxHits: 2, windowMs: 60_000 });

    expect(limiter.consume("user-1").allowed).toBe(true);
    expect(limiter.consume("user-1").allowed).toBe(true);
    expect(limiter.consume("user-1").allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the config and limiter tests to verify they fail**

Run: `pnpm.cmd test -- server/productionConfig.test.ts server/rateLimit.test.ts`

Expected: FAIL because the modules do not exist yet.

- [ ] **Step 3: Create the production config guard**

```ts
import { ENV } from "./env";

export function assertProductionConfig() {
  if (!ENV.isProduction) {
    return;
  }

  const missing: string[] = [];

  if (!ENV.appOrigin.startsWith("https://")) missing.push("APP_ORIGIN(https)");
  if (!ENV.databaseUrl) missing.push("DATABASE_URL");
  if (!ENV.betterAuthSecret) missing.push("BETTER_AUTH_SECRET");
  if (!ENV.aiBaseUrl) missing.push("AI_BASE_URL");
  if (!ENV.aiApiKey) missing.push("AI_API_KEY");
  if (!ENV.s3Endpoint) missing.push("S3_ENDPOINT");
  if (!ENV.s3Region) missing.push("S3_REGION");
  if (!ENV.s3Bucket) missing.push("S3_BUCKET");
  if (!ENV.s3AccessKeyId) missing.push("S3_ACCESS_KEY_ID");
  if (!ENV.s3SecretAccessKey) missing.push("S3_SECRET_ACCESS_KEY");
  if (!ENV.smtpHost) missing.push("SMTP_HOST");
  if (!ENV.smtpUser) missing.push("SMTP_USER");
  if (!ENV.smtpPass) missing.push("SMTP_PASS");
  if (!ENV.smtpFromEmail) missing.push("SMTP_FROM_EMAIL");

  if (missing.length > 0) {
    throw new Error(`Missing required production configuration: ${missing.join(", ")}`);
  }
}
```

- [ ] **Step 4: Create the in-memory limiter and reusable trial quotas**

```ts
type HitResult = {
  allowed: boolean;
  remaining: number;
};

export function createFixedWindowLimiter({
  key,
  maxHits,
  windowMs,
}: {
  key: string;
  maxHits: number;
  windowMs: number;
}) {
  const entries = new Map<string, { count: number; resetAt: number }>();

  return {
    consume(identity: string): HitResult {
      const now = Date.now();
      const cacheKey = `${key}:${identity}`;
      const existing = entries.get(cacheKey);

      if (!existing || existing.resetAt <= now) {
        entries.set(cacheKey, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxHits - 1 };
      }

      if (existing.count >= maxHits) {
        return { allowed: false, remaining: 0 };
      }

      existing.count += 1;
      return { allowed: true, remaining: maxHits - existing.count };
    },

    reset() {
      entries.clear();
    },
  };
}
```

- [ ] **Step 5: Wire startup validation, proxy trust, parsers, and `/healthz`**

```ts
async function startServer() {
  assertProductionConfig();

  const app = express();
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  registerAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
}
```

- [ ] **Step 6: Disable database fallbacks in production**

```ts
export async function getDb() {
  if (!_db) {
    const pool = getMySqlPool();
    if (!pool) {
      if (ENV.isProduction) {
        throw new Error("DATABASE_URL is required in production");
      }
      return null;
    }

    _db = drizzle(pool);
  }

  return _db;
}
```

```ts
if (!db) {
  if (ENV.isProduction) {
    throw new Error("Database fallback is disabled in production");
  }
  return MOCK_SCENARIOS;
}
```

- [ ] **Step 7: Apply trial limits to auth and high-cost tRPC mutations**

```ts
const magicLinkIpLimiter = createFixedWindowLimiter({
  key: "magic-link-ip",
  maxHits: 5,
  windowMs: 60 * 60 * 1000,
});

const magicLinkEmailLimiter = createFixedWindowLimiter({
  key: "magic-link-email",
  maxHits: 3,
  windowMs: 60 * 60 * 1000,
});
```

```ts
app.use("/api/auth", (req, res, next) => {
  if (req.method !== "POST") return next();

  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const ipHit = magicLinkIpLimiter.consume(ip);
  if (!ipHit.allowed) {
    return res.status(429).json({ error: "Too many auth requests. Please try again later." });
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (email) {
    const emailHit = magicLinkEmailLimiter.consume(email);
    if (!emailHit.allowed) {
      return res.status(429).json({ error: "Too many login emails sent. Please try again later." });
    }
  }

  next();
});
```

```ts
const chatLimiter = createFixedWindowLimiter({ key: "chat", maxHits: 60, windowMs: 60 * 60 * 1000 });
const voiceLimiter = createFixedWindowLimiter({ key: "voice", maxHits: 20, windowMs: 60 * 60 * 1000 });
const ttsLimiter = createFixedWindowLimiter({ key: "tts", maxHits: 40, windowMs: 60 * 60 * 1000 });

function assertAllowed(limiter: ReturnType<typeof createFixedWindowLimiter>, identity: string, message: string) {
  const result = limiter.consume(identity);
  if (!result.allowed) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
  }
}
```

```ts
const requester = `${ctx.user.id}:${ctx.req.ip ?? "unknown"}`;
assertAllowed(chatLimiter, requester, "Chat rate limit exceeded");
assertAllowed(voiceLimiter, requester, "Voice upload rate limit exceeded");
assertAllowed(ttsLimiter, requester, "TTS rate limit exceeded");
```

- [ ] **Step 8: Run the guard and limiter tests plus the router suite**

Run: `pnpm.cmd test -- server/productionConfig.test.ts server/rateLimit.test.ts server/features.test.ts`

Expected: PASS for new startup/limiter coverage and PASS for the existing router coverage after limiter resets are added to tests.

- [ ] **Step 9: Checkpoint this task**

If the implementation workspace is attached to git:

```bash
git add server/_core/productionConfig.ts server/_core/rateLimit.ts server/productionConfig.test.ts server/rateLimit.test.ts server/_core/index.ts server/_core/auth.ts server/db.ts server/routers.ts server/features.test.ts
git commit -m "feat: add production guards and trial rate limits"
```

### Task 5: Replace `~/app` Navigation with Explicit Route Helpers

**Files:**
- Create: `client/src/lib/routes.ts`
- Create: `client/src/lib/routes.test.ts`
- Modify: `client/src/pages/Chat.tsx`
- Modify: `client/src/pages/Explore.tsx`
- Modify: `client/src/pages/Courses.tsx`
- Modify: `client/src/pages/History.tsx`
- Modify: `client/src/pages/ConversationDetail.tsx`
- Modify: `client/src/components/DashboardLayout.tsx`
- Test: `client/src/lib/routes.test.ts`

- [ ] **Step 1: Write the failing route helper test**

```ts
import { describe, expect, it } from "vitest";
import { appRoutes } from "./routes";

describe("appRoutes", () => {
  it("builds absolute paths for the app shell", () => {
    expect(appRoutes.explore()).toBe("/app");
    expect(appRoutes.chat()).toBe("/app/chat");
    expect(appRoutes.conversation(42)).toBe("/app/chat/42");
    expect(appRoutes.courses()).toBe("/app/courses");
  });
});
```

- [ ] **Step 2: Run the route helper test to verify it fails**

Run: `pnpm.cmd test -- client/src/lib/routes.test.ts`

Expected: FAIL with `Cannot find module './routes'`.

- [ ] **Step 3: Create the shared route helper**

```ts
export const appRoutes = {
  explore: () => "/app",
  chat: () => "/app/chat",
  conversation: (id: number | string) => `/app/chat/${id}`,
  courses: () => "/app/courses",
  dashboard: () => "/app/dashboard",
  history: () => "/app/history",
} as const;
```

- [ ] **Step 4: Replace all `~/app/...` usages with the helper**

```tsx
import { appRoutes } from "@/lib/routes";

setLocation(appRoutes.conversation(data.conversationId));
setLocation(appRoutes.chat());
setLocation(appRoutes.courses());
```

```tsx
const menuItems = [
  { icon: Compass, label: "Explore", path: appRoutes.explore() },
  { icon: MessageCircle, label: "Conversation", path: appRoutes.chat() },
  { icon: BookOpen, label: "Courses", path: appRoutes.courses() },
  { icon: BarChart3, label: "Dashboard", path: appRoutes.dashboard() },
  { icon: History, label: "History", path: appRoutes.history() },
];

const activeMenuItem = menuItems.find(item => {
  return location === item.path || (item.path !== "/app" && location.startsWith(item.path));
});
```

- [ ] **Step 5: Run the route helper test plus typecheck**

Run: `pnpm.cmd test -- client/src/lib/routes.test.ts`

Expected: PASS with explicit absolute paths.

Run: `pnpm.cmd check`

Expected: PASS with no leftover `~/app` assumptions.

- [ ] **Step 6: Checkpoint this task**

If the implementation workspace is attached to git:

```bash
git add client/src/lib/routes.ts client/src/lib/routes.test.ts client/src/pages/Chat.tsx client/src/pages/Explore.tsx client/src/pages/Courses.tsx client/src/pages/History.tsx client/src/pages/ConversationDetail.tsx client/src/components/DashboardLayout.tsx
git commit -m "fix: use explicit absolute app routes"
```

### Task 6: Ship the Deployment Assets and Operator Guide

**Files:**
- Create: `docker-compose.yml`
- Create: `Caddyfile`
- Create: `.env.production.example`
- Create: `docs/deployment/tencent-cloud-hk-lighthouse.md`
- Modify: `Dockerfile`
- Modify: `.dockerignore`
- Modify: `package.json`

- [ ] **Step 1: Add a production environment template**

```env
APP_ORIGIN=https://app.example.com
PORT=3000
NODE_ENV=production
DATABASE_URL=mysql://ai_tutor:${MYSQL_PASSWORD}@mysql:3306/ai_tutor
BETTER_AUTH_SECRET=replace-with-a-64-char-secret
ADMIN_EMAIL=owner@example.com
AI_BASE_URL=https://aihubmix.com/v1
AI_API_KEY=replace-me
AI_CHAT_MODEL=gemini-2.5-flash-lite
AI_STT_MODEL=whisper-1
AI_TTS_MODEL=gpt-4o-mini-tts
S3_ENDPOINT=https://cos.ap-hongkong.myqcloud.com
S3_REGION=ap-hongkong
S3_BUCKET=ai-tutor-audio-1250000000
S3_ACCESS_KEY_ID=replace-me
S3_SECRET_ACCESS_KEY=replace-me
SMTP_HOST=smtp.qcloudmail.com
SMTP_PORT=587
SMTP_USER=replace-me
SMTP_PASS=replace-me
SMTP_FROM_EMAIL=AI Tutor <noreply@example.com>
```

- [ ] **Step 2: Add the Docker Compose stack**

```yaml
services:
  app:
    build:
      context: .
    restart: always
    env_file:
      - .env.production
    depends_on:
      - mysql
    expose:
      - "3000"

  mysql:
    image: mysql:8.4
    restart: always
    environment:
      MYSQL_DATABASE: ai_tutor
      MYSQL_USER: ai_tutor
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
    command:
      - --default-authentication-plugin=mysql_native_password
    volumes:
      - mysql-data:/var/lib/mysql

  caddy:
    image: caddy:2.8
    restart: always
    depends_on:
      - app
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config

volumes:
  mysql-data:
  caddy-data:
  caddy-config:
```

- [ ] **Step 3: Add the Caddy reverse proxy**

```caddy
app.example.com {
  encode gzip zstd

  reverse_proxy app:3000

  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
  }
}
```

- [ ] **Step 4: Tighten the Docker image inputs**

```dockerfile
FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```dockerignore
node_modules
dist
.env
.env.production
dev.log
.manus
.manus-logs
```

- [ ] **Step 5: Write the server runbook**

```md
# Tencent Cloud Hong Kong Lighthouse Deployment

1. Provision a 2C4G Ubuntu 24.04 Lighthouse instance in Hong Kong.
2. Point `app.example.com` to the server public IP.
3. Install Docker and Docker Compose plugin.
4. Copy the repository to `/opt/ai-tutor`.
5. Copy `.env.production.example` to `.env.production` and fill in secrets.
6. Set `MYSQL_PASSWORD` and `MYSQL_ROOT_PASSWORD` in the shell before `docker compose up`.
7. Start the data services: `docker compose up -d mysql`
8. Run migrations: `docker compose run --rm app pnpm db:push`
9. Start the full stack: `docker compose up -d`
10. Verify `https://app.example.com/healthz` returns `{"ok":true}`.
11. Smoke-test login, chat, STT, and TTS from the public domain.
```

- [ ] **Step 6: Run final project verification**

Run: `pnpm.cmd check`

Expected: PASS

Run: `pnpm.cmd test`

Expected: PASS

Run: `pnpm.cmd build`

Expected: PASS

- [ ] **Step 7: Validate the deployment assets**

Run: `docker compose config`

Expected: fully rendered Compose YAML with `app`, `mysql`, and `caddy` services and no syntax errors.

- [ ] **Step 8: Checkpoint this task**

If the implementation workspace is attached to git:

```bash
git add Dockerfile .dockerignore docker-compose.yml Caddyfile .env.production.example docs/deployment/tencent-cloud-hk-lighthouse.md package.json pnpm-lock.yaml
git commit -m "chore: add hong kong deployment assets"
```

## Self-Review

### Spec coverage

- AiHubMix gateway migration: covered by Task 1
- Tencent SES SMTP migration: covered by Task 2
- COS S3-compatible storage and object-key persistence: covered by Task 3
- Production fail-fast startup and `/healthz`: covered by Task 4
- Public trial rate limiting: covered by Task 4
- Route correctness for public deployment: covered by Task 5
- Docker Compose, Caddy, and server runbook: covered by Task 6

No gaps remain against the approved design document.

### Placeholder scan

- No `TBD`, `TODO`, or deferred implementation markers remain in this plan.
- Each task contains explicit file paths, test commands, and implementation snippets.

### Type consistency

- AI configuration uses `AI_*` names consistently across env, helper, and service clients.
- Storage configuration uses `S3_*` names consistently across env and storage adapter.
- SMTP configuration uses `SMTP_*` names consistently across env, auth, and mail sender.
- Audio persistence uses `audioObjectKey` and `audioContentType` consistently in schema, DB helpers, router responses, and client hydration.
