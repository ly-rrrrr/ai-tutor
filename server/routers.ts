import { COOKIE_NAME } from "@shared/const";
import { createHash } from "node:crypto";
import { clearGuestCookie, getSessionCookieOptions } from "./_core/cookies";
import { signOutCurrentSession } from "./_core/auth";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { invokeLLM } from "./_core/llm";
import { TtlLruCache } from "./_core/utilityCache";
import { transcribeAudio } from "./_core/voiceTranscription";
import { textToSpeech } from "./_core/tts";
import { storageExists, storageGet, storagePut } from "./storage";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createFixedWindowLimiter } from "./_core/rateLimit";
import {
  getAllScenarios,
  getScenarioById,
  createConversation,
  getConversationById,
  getUserConversations,
  updateConversation,
  createMessage,
  updateMessage,
  getConversationMessages,
  getMessageById,
  upsertLearningRecord,
  getUserLearningRecords,
  getUserDashboardStats,
  updateUserStats,
} from "./db";

const chatLimiter = createFixedWindowLimiter({
  key: "chat",
  maxHits: 60,
  windowMs: 60 * 60 * 1000,
});

const voiceLimiter = createFixedWindowLimiter({
  key: "voice",
  maxHits: 20,
  windowMs: 60 * 60 * 1000,
});

const ttsLimiter = createFixedWindowLimiter({
  key: "tts",
  maxHits: 40,
  windowMs: 60 * 60 * 1000,
});

type WordLookupResult = {
  word: string;
  phonetic: string;
  definitions: Array<{ partOfSpeech: string; meaning: string; example: string }>;
  synonyms: string[];
  level: string;
};

const translationCache = new TtlLruCache<{ translation: string }>(
  500,
  1000 * 60 * 60 * 24
);
const wordLookupCache = new TtlLruCache<WordLookupResult>(
  1000,
  1000 * 60 * 60 * 24 * 7
);

function normalizeUtilityText(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function hashCacheKey(parts: string[]) {
  return createHash("sha256").update(parts.join("\0")).digest("hex");
}

function getTranslationCacheKey(text: string, targetLanguage: string) {
  return hashCacheKey([
    "translation:v1",
    ENV.aiChatModel,
    targetLanguage.trim().toLowerCase(),
    normalizeUtilityText(text),
  ]);
}

function normalizeLookupWord(word: string) {
  return word.trim().toLowerCase();
}

function getWordLookupCacheKey(word: string) {
  return hashCacheKey([
    "word:v1",
    ENV.aiChatModel,
    normalizeLookupWord(word),
  ]);
}

// Helper: strip markdown code fences that some LLM providers wrap around JSON output
function parseJsonContent<T>(content: string): T {
  const stripped = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  return JSON.parse(stripped) as T;
}

async function resolveMessageAudio<T extends { audioObjectKey?: string | null; audioUrl?: string | null }>(
  message: T
): Promise<T> {
  if (!message.audioObjectKey) {
    return message;
  }

  try {
    const { url } = await storageGet(message.audioObjectKey);
    return { ...message, audioUrl: url };
  } catch {
    return message;
  }
}

function normalizeAudioObjectKey(key: string): string {
  return key.replace(/^\/+/, "");
}

function getRequesterIdentity(ctx: {
  user: { id: number };
  req: { ip?: string | undefined; socket?: { remoteAddress?: string | undefined } };
}) {
  return `${ctx.user.id}:${ctx.req.ip ?? ctx.req.socket?.remoteAddress ?? "unknown"}`;
}

function assertAllowed(
  limiter: ReturnType<typeof createFixedWindowLimiter>,
  identity: string,
  message: string
) {
  const result = limiter.consume(identity);
  if (!result.allowed) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message });
  }
}

async function assertOwnedUploadedAudio(
  userId: number,
  audioObjectKey: string,
  audioContentType?: string
): Promise<{ audioObjectKey: string; audioContentType: string }> {
  const normalizedAudioObjectKey = normalizeAudioObjectKey(audioObjectKey);

  if (!normalizedAudioObjectKey.startsWith(`audio/${userId}/`)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Audio upload does not belong to the current user" });
  }

  if (!audioContentType || !audioContentType.startsWith("audio/")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Audio content type is required for uploaded audio" });
  }

  if (!(await storageExists(normalizedAudioObjectKey))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Uploaded audio object was not found" });
  }

  return {
    audioObjectKey: normalizedAudioObjectKey,
    audioContentType,
  };
}

async function assertOwnedMessage(
  userId: number,
  messageId: number,
  expectedRole: "user" | "assistant"
) {
  const message = await getMessageById(messageId);
  if (!message || message.role !== expectedRole) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
  }

  const conversation = await getConversationById(message.conversationId);
  if (!conversation || conversation.userId !== userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Message not found" });
  }

  return message;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    config: publicProcedure.query(() => ({
      guestAccessEnabled: ENV.guestAccessEnabled,
      turnstileSiteKey: ENV.turnstileSiteKey || null,
    })),
    logout: publicProcedure.mutation(async ({ ctx }) => {
      await signOutCurrentSession(ctx.req);
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      clearGuestCookie(ctx.res, ctx.req);
      return { success: true } as const;
    }),
  }),

  // ==================== Scenario Routes ====================
  scenario: router({
    list: publicProcedure.query(async () => {
      return getAllScenarios();
    }),
    getById: publicProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        const scenario = await getScenarioById(input.id);
        if (!scenario) throw new TRPCError({ code: "NOT_FOUND", message: "Scenario not found" });
        return scenario;
      }),
  }),

  // ==================== Conversation Routes ====================
  conversation: router({
    create: protectedProcedure
      .input(z.object({
        scenarioId: z.number().optional(),
        title: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const scenarioId = input.scenarioId;
        let title = input.title || "Free Conversation";
        let openingMessage = "Hello! I'm your AI English tutor. What would you like to practice today?";
        let systemPrompt = "You are a friendly and patient English tutor. Help the user practice English conversation. IMPORTANT: Keep every reply to 1-2 short sentences only — like a real face-to-face conversation. Ask one question at a time. Do NOT list multiple questions or give long explanations in a single turn. Let the student lead the pace."

        if (scenarioId) {
          const scenario = await getScenarioById(scenarioId);
          if (scenario) {
            title = scenario.title;
            openingMessage = scenario.openingMessage;
            systemPrompt = scenario.systemPrompt;
          }
        }

        const conversationId = await createConversation({
          userId: ctx.user.id,
          scenarioId: scenarioId ?? null,
          title,
          status: "active",
        });

        // Save system message
        await createMessage({
          conversationId,
          role: "system",
          content: systemPrompt,
        });

        // Save opening message
        await createMessage({
          conversationId,
          role: "assistant",
          content: openingMessage,
        });

        return { conversationId, openingMessage, title };
      }),

    list: protectedProcedure
      .input(z.object({
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        const limit = input?.limit ?? 20;
        const offset = input?.offset ?? 0;
        return getUserConversations(ctx.user.id, limit, offset);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const conv = await getConversationById(input.id);
        if (!conv || conv.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
        }
        const msgs = await Promise.all(
          (await getConversationMessages(input.id)).map(resolveMessageAudio)
        );
        return { conversation: conv, messages: msgs };
      }),

    complete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const conv = await getConversationById(input.id);
        if (!conv || conv.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        const msgs = await getConversationMessages(input.id);
        const userMsgs = msgs.filter(m => m.role === "user");

        // Generate summary feedback
        let feedback = "";
        try {
          const feedbackResult = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are an English tutor providing a brief conversation summary. Analyze the student's performance and give feedback in 3-4 sentences covering: overall impression, strengths, and areas for improvement. Be encouraging and specific. Respond in both English and Chinese (中文翻译).`,
              },
              {
                role: "user",
                content: `Here are the student's messages from our conversation:\n${userMsgs.map(m => m.content).join("\n")}\n\nPlease provide a brief performance summary.`,
              },
            ],
          });
          feedback = feedbackResult.choices[0]?.message?.content as string || "";
        } catch (e) {
          feedback = "Great job practicing today! Keep up the good work.";
        }

        // Calculate avg score
        const scores = userMsgs.filter(m => m.pronunciationScore).map(m => m.pronunciationScore!);
        const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

        await updateConversation(input.id, {
          status: "completed",
          feedback,
          avgScore,
          messageCount: msgs.filter(m => m.role !== "system").length,
        });

        // Update user stats
        const totalConvs = (ctx.user.totalConversations ?? 0) + 1;
        const updates: Record<string, unknown> = { totalConversations: totalConvs };
        if (avgScore !== null) {
          const prevAvg = ctx.user.avgPronunciationScore ?? 0;
          const prevCount = ctx.user.totalConversations ?? 0;
          updates.avgPronunciationScore = prevCount > 0
            ? (prevAvg * prevCount + avgScore) / totalConvs
            : avgScore;
        }
        await updateUserStats(ctx.user.id, updates as any);

        // Upsert daily learning record
        const today = new Date().toISOString().split("T")[0];
        const wordsCount = userMsgs.reduce((sum, m) => sum + m.content.split(/\s+/).length, 0);
        await upsertLearningRecord({
          userId: ctx.user.id,
          date: today,
          conversationCount: 1,
          wordsSpoken: wordsCount,
          avgPronunciationScore: avgScore,
        });

        return { feedback, avgScore };
      }),
  }),

  // ==================== Chat (LLM Dialogue) Routes ====================
  chat: router({
    send: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
        content: z.string().min(1),
        audioUrl: z.string().optional(),
        audioObjectKey: z.string().optional(),
        audioContentType: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        assertAllowed(
          chatLimiter,
          getRequesterIdentity(ctx),
          "Chat rate limit exceeded"
        );

        const conv = await getConversationById(input.conversationId);
        if (!conv || conv.userId !== ctx.user.id) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        const userAudioFields = input.audioObjectKey
          ? await assertOwnedUploadedAudio(
              ctx.user.id,
              input.audioObjectKey,
              input.audioContentType
            )
          : {
              audioUrl: input.audioUrl,
            };

         // Save user message
        const userMessageId = await createMessage({
          conversationId: input.conversationId,
          role: "user",
          content: input.content,
          ...userAudioFields,
        });
        // Get conversation history
        const history = await getConversationMessages(input.conversationId);
        const llmMessages = history.map(m => ({
          role: m.role as "system" | "user" | "assistant",
          content: m.content,
        }));
        // Inject brevity constraint after system prompt to enforce short replies
        const systemIdx = llmMessages.findIndex(m => m.role === "system");
        const brevityRule: { role: "system" | "user" | "assistant"; content: string } = {
          role: "system",
          content: "REPLY RULE (non-negotiable): Respond with EXACTLY 1-2 sentences. No lists, no bullet points, no multiple questions in one turn. One short natural sentence is ideal. Ask at most one follow-up question per turn. Imagine you are speaking face-to-face — keep it brief and conversational.",
        };
        if (systemIdx >= 0) {
          llmMessages.splice(systemIdx + 1, 0, brevityRule);
        } else {
          llmMessages.unshift(brevityRule);
        }
        // Call LLM for response
        const result = await invokeLLM({ messages: llmMessages });
        const assistantContent = result.choices[0]?.message?.content as string || "I'm sorry, could you repeat that?";
        // Save assistant message
        const assistantMessageId = await createMessage({
          conversationId: input.conversationId,
          role: "assistant",
          content: assistantContent,
        });
        // Update conversation message count
        await updateConversation(input.conversationId, {
          messageCount: (conv.messageCount ?? 0) + 2,
        });
        return { content: assistantContent, userMessageId, assistantMessageId };
      }),

    // Analyze user message for grammar and expression improvements
    analyze: protectedProcedure
      .input(z.object({
        userMessage: z.string().min(1),
        conversationId: z.number(),
        messageId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.messageId) {
          await assertOwnedMessage(ctx.user.id, input.messageId, "user");
        }

        try {
          const result = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are an English language analysis expert. Analyze the following English sentence for:
1. Grammar errors (if any)
2. More natural/idiomatic expressions

Return JSON with this exact structure:
{
  "grammarCorrections": [{"original": "...", "corrected": "...", "explanation": "..."}],
  "expressionSuggestions": [{"original": "...", "better": "...", "reason": "..."}],
  "overallScore": 85,
  "encouragement": "..."
}

If the sentence is perfect, return empty arrays and a high score. Be encouraging. Provide explanations in both English and Chinese.`,
              },
              { role: "user", content: input.userMessage },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "analysis_result",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    grammarCorrections: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          original: { type: "string" },
                          corrected: { type: "string" },
                          explanation: { type: "string" },
                        },
                        required: ["original", "corrected", "explanation"],
                        additionalProperties: false,
                      },
                    },
                    expressionSuggestions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          original: { type: "string" },
                          better: { type: "string" },
                          reason: { type: "string" },
                        },
                        required: ["original", "better", "reason"],
                        additionalProperties: false,
                      },
                    },
                    overallScore: { type: "number" },
                    encouragement: { type: "string" },
                  },
                  required: ["grammarCorrections", "expressionSuggestions", "overallScore", "encouragement"],
                  additionalProperties: false,
                },
              },
            },
          });

          const content = result.choices[0]?.message?.content as string;
          type AnalysisResult = { grammarCorrections: Array<{original:string;corrected:string;explanation:string}>; expressionSuggestions: Array<{original:string;better:string;reason:string}>; overallScore: number; encouragement: string };
          const analysis = parseJsonContent<AnalysisResult>(content);

          // Persist analysis results to the message record if messageId is provided
          if (input.messageId) {
            updateMessage(input.messageId, {
              grammarCorrections: analysis.grammarCorrections,
              expressionSuggestions: analysis.expressionSuggestions,
            }).catch(() => { /* non-blocking */ });
          }
          return analysis;
        } catch (e) {
          return {
            grammarCorrections: [],
            expressionSuggestions: [],
            overallScore: 80,
            encouragement: "Keep practicing! You're doing well.",
          };
        }
      }),

    // Translate AI message to target language (default: Chinese)
    translate: protectedProcedure
      .input(z.object({
        text: z.string().min(1).max(2000),
        targetLanguage: z.string().default("Chinese"),
      }))
      .mutation(async ({ input }) => {
        try {
          const normalizedText = normalizeUtilityText(input.text);
          const cacheKey = getTranslationCacheKey(normalizedText, input.targetLanguage);
          const cached = translationCache.get(cacheKey);
          if (cached) return cached;

          const result = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are a professional translator. Translate the given English text to ${input.targetLanguage}. Return ONLY the translated text, no explanations, no quotes, no extra formatting.`,
              },
              { role: "user", content: normalizedText },
            ],
            maxTokens: 256,
          });
          const translation = result.choices[0]?.message?.content as string || "";
          const payload = { translation: translation.trim() };
          if (payload.translation) {
            translationCache.set(cacheKey, payload);
          }
          return payload;
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Translation failed" });
        }
      }),

    // Suggest smart reply options based on conversation context
    suggestReply: protectedProcedure
      .input(z.object({
        conversationId: z.number(),
      }))
      .mutation(async ({ input }) => {
        try {
          const history = await getConversationMessages(input.conversationId);
          const recentHistory = history.slice(-6).map(m => ({
            role: m.role as "system" | "user" | "assistant",
            content: m.content,
          }));
          const result = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are an English learning assistant. Based on the conversation context, suggest 3 natural English reply options for the student. Each reply should be a complete, contextually appropriate sentence. Include a fill-in-the-blank option where relevant (e.g., "My favorite movie is _____ (comedy).").
Return JSON with this exact structure:
{
  "suggestions": [
    {"text": "English reply option 1", "hint": "\u4e2d\u6587\u63d0\u793a\u8bf4\u660e"},
    {"text": "English reply option 2", "hint": "\u4e2d\u6587\u63d0\u793a\u8bf4\u660e"},
    {"text": "English reply option 3 with _____ (hint)", "hint": "\u4e2d\u6587\u63d0\u793a\u8bf4\u660e"}
  ]
}`,
              },
              ...recentHistory,
              {
                role: "user",
                content: "Please suggest 3 reply options for me to continue this conversation naturally.",
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "reply_suggestions",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    suggestions: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          text: { type: "string" },
                          hint: { type: "string" },
                        },
                        required: ["text", "hint"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["suggestions"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = result.choices[0]?.message?.content as string;
          const parsed = parseJsonContent<{ suggestions: Array<{ text: string; hint: string }> }>(content);
          return parsed;
        } catch {
          return {
            suggestions: [
              { text: "Could you please repeat that?", hint: "\u8bf7\u5bf9\u65b9\u91cd\u590d" },
              { text: "I understand. Let me try again.", hint: "\u8868\u793a\u7406\u89e3\u5e76\u91cd\u8bd5" },
              { text: "That's interesting! Tell me more.", hint: "\u8868\u793a\u5174\u8da3\uff0c\u8bf7\u5bf9\u65b9\u7ee7\u7eed" },
            ],
          };
        }
      }),

    // Translate Chinese input to English for the student
    translateToEnglish: protectedProcedure
      .input(z.object({
        chineseText: z.string().min(1).max(500),
        conversationId: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        try {
          let contextHint = "";
          if (input.conversationId) {
            const history = await getConversationMessages(input.conversationId);
            const lastAssistant = [...history].reverse().find(m => m.role === "assistant");
            if (lastAssistant) {
              contextHint = `\nConversation context - AI tutor's last message: "${lastAssistant.content.slice(0, 200)}"`;
            }
          }
          const result = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are an English learning assistant. Translate the student's Chinese input into natural, conversational English suitable for the current context.${contextHint}
Return JSON with this exact structure:
{
  "english": "the natural English translation",
  "alternatives": ["alternative phrasing 1", "alternative phrasing 2"]
}`,
              },
              { role: "user", content: input.chineseText },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "translation_result",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    english: { type: "string" },
                    alternatives: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: ["english", "alternatives"],
                  additionalProperties: false,
                },
              },
            },
          });
          const content = result.choices[0]?.message?.content as string;
          const parsed = parseJsonContent<{ english: string; alternatives: string[] }>(content);
          return parsed;
        } catch {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Translation failed" });
        }
      }),
  }),

  // ==================== Voice Routes ====================
  voice: router({
    uploadAudio: protectedProcedure
      .input(z.object({
        audioBase64: z.string(),
        mimeType: z.string().default("audio/webm"),
      }))
      .mutation(async ({ input, ctx }) => {
        assertAllowed(
          voiceLimiter,
          getRequesterIdentity(ctx),
          "Voice upload rate limit exceeded"
        );

        const buffer = Buffer.from(input.audioBase64, "base64");
        const ext = input.mimeType.includes("webm") ? "webm" : input.mimeType.includes("wav") ? "wav" : "mp3";
        const key = `audio/${ctx.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const storedAudio = await storagePut(key, buffer, input.mimeType);
        return {
          audioUrl: storedAudio.url,
          audioObjectKey: storedAudio.key,
          audioContentType: input.mimeType,
        };
      }),

    transcribe: protectedProcedure
      .input(z.object({
        audioUrl: z.string(),
        language: z.string().default("en"),
      }))
      .mutation(async ({ input }) => {
        const result = await transcribeAudio({
          audioUrl: input.audioUrl,
          language: input.language,
          prompt: "Transcribe the English speech accurately.",
        });
        if ("error" in result) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error,
          });
        }
        return { text: result.text, language: result.language, duration: result.duration };
      }),

    // Text-to-Speech: convert text to audio
    tts: protectedProcedure
      .input(z.object({
        text: z.string().min(1).max(4096),
        voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).default("nova"),
        speed: z.number().min(0.25).max(4.0).default(1.0),
        messageId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        assertAllowed(
          ttsLimiter,
          getRequesterIdentity(ctx),
          "TTS rate limit exceeded"
        );

        if (input.messageId) {
          await assertOwnedMessage(ctx.user.id, input.messageId, "assistant");
        }

        const result = await textToSpeech({
          text: input.text,
          voice: input.voice,
          speed: input.speed,
        });
        if ("error" in result) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: result.error,
          });
        }
        // Upload to S3 and return URL
        const key = `tts/${ctx.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
        const storedAudio = await storagePut(key, result.audioBuffer, result.contentType);
        if (input.messageId) {
          await updateMessage(input.messageId, {
            audioObjectKey: storedAudio.key,
            audioContentType: result.contentType,
          });
        }
        return {
          audioUrl: storedAudio.url,
          audioObjectKey: storedAudio.key,
          audioContentType: result.contentType,
        };
      }),

    // Pronunciation assessment using LLM
    assessPronunciation: protectedProcedure
      .input(z.object({
        spokenText: z.string(),
        expectedText: z.string().optional(),
        conversationId: z.number(),
        messageId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        if (input.messageId) {
          await assertOwnedMessage(ctx.user.id, input.messageId, "user");
        }

        try {
          const prompt = input.expectedText
            ? `The user was supposed to say: "${input.expectedText}"\nThey actually said: "${input.spokenText}"\n\nAssess their pronunciation accuracy.`
            : `The user said: "${input.spokenText}"\n\nAssess their English pronunciation quality.`;

          const result = await invokeLLM({
            messages: [
              {
                role: "system",
                content: `You are an English pronunciation assessment expert. Evaluate the spoken text and provide a detailed assessment.

Return JSON with this exact structure:
{
  "accuracy": 85,
  "fluency": 80,
  "completeness": 90,
  "overallScore": 85,
  "suggestions": ["suggestion1", "suggestion2"]
}

Scores should be 0-100. Be fair but encouraging. Provide suggestions in both English and Chinese.`,
              },
              { role: "user", content: prompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "pronunciation_assessment",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    accuracy: { type: "number" },
                    fluency: { type: "number" },
                    completeness: { type: "number" },
                    overallScore: { type: "number" },
                    suggestions: { type: "array", items: { type: "string" } },
                  },
                  required: ["accuracy", "fluency", "completeness", "overallScore", "suggestions"],
                  additionalProperties: false,
                },
              },
            },
          });

          const content = result.choices[0]?.message?.content as string;
          type AssessmentResult = { accuracy: number; fluency: number; completeness: number; overallScore: number; suggestions: string[] };
          const assessment = parseJsonContent<AssessmentResult>(content);
          // Persist pronunciation score to message record if messageId is provided
          if (input.messageId) {
            updateMessage(input.messageId, {
              pronunciationScore: assessment.overallScore,
              pronunciationFeedback: {
                accuracy: assessment.accuracy,
                fluency: assessment.fluency,
                completeness: assessment.completeness,
                suggestions: assessment.suggestions,
              },
            }).catch(() => { /* non-blocking */ });
          }
          return assessment;
        } catch (e) {
          return {
            accuracy: 75,
            fluency: 75,
            completeness: 80,
            overallScore: 77,
            suggestions: ["Keep practicing! Try speaking more slowly and clearly."],
          };
        }
      }),
  }),

  // ==================== Dashboard / Learning Stats Routes ====================
  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => {
      return getUserDashboardStats(ctx.user.id);
    }),

    learningRecords: protectedProcedure
      .input(z.object({ days: z.number().min(1).max(365).default(30) }).optional())
      .query(async ({ ctx, input }) => {
        return getUserLearningRecords(ctx.user.id, input?.days ?? 30);
      }),

    // Get personalized recommendations
    recommendations: protectedProcedure.query(async ({ ctx }) => {
      const stats = await getUserDashboardStats(ctx.user.id);
      const scenarios = await getAllScenarios();

      // Simple recommendation logic based on user level and history
      const level = ctx.user.level || "A2";
      const difficultyMap: Record<string, string> = {
        A1: "beginner", A2: "beginner",
        B1: "intermediate", B2: "intermediate",
        C1: "advanced", C2: "advanced",
      };
      const targetDifficulty = difficultyMap[level] || "beginner";

      const recommended = scenarios.filter(s => s.difficulty === targetDifficulty).slice(0, 4);
      const challengeScenarios = scenarios.filter(s => {
        if (targetDifficulty === "beginner") return s.difficulty === "intermediate";
        if (targetDifficulty === "intermediate") return s.difficulty === "advanced";
        return s.difficulty === "advanced";
      }).slice(0, 2);

      return {
        level,
        recommended,
        challenge: challengeScenarios,
        tip: getTipForLevel(level),
      };
    }),
  }),
  // ==================== Word Dictionary Routes ====================
  word: router({
    lookup: protectedProcedure
      .input(z.object({
        word: z.string().min(1).max(100),
      }))
      .query(async ({ input }) => {
        const word = normalizeLookupWord(input.word);
        const cacheKey = getWordLookupCacheKey(word);
        const cached = wordLookupCache.get(cacheKey);
        if (cached) return cached;

        const result = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an English dictionary assistant. Return a JSON object with the following structure for the given word:
{
  "word": "string (the word as given)",
  "phonetic": "string (IPA phonetic transcription, e.g. /həˈloʊ/)",
  "definitions": [
    {
      "partOfSpeech": "string (noun/verb/adjective/adverb/etc)",
      "meaning": "string (Chinese meaning, concise)",
      "example": "string (one natural English example sentence using the word)"
    }
  ],
  "synonyms": ["string", "string"],
  "level": "string (CEFR level: A1/A2/B1/B2/C1/C2)"
}
Include 1-3 most common definitions. Keep Chinese meanings concise (within 15 characters each). Return ONLY the JSON object, no extra text.`,
            },
            { role: "user", content: word },
          ],
          maxTokens: 512,
        });
        const content = result.choices[0]?.message?.content as string || "{}";
        try {
          const parsed = parseJsonContent<WordLookupResult>(content);
          wordLookupCache.set(cacheKey, parsed);
          return parsed;
        } catch {
          return {
            word,
            phonetic: "",
            definitions: [{ partOfSpeech: "unknown", meaning: "暂无释义", example: "" }],
            synonyms: [],
            level: "",
          };
        }
      }),
  }),
});

function getTipForLevel(level: string): string {
  const tips: Record<string, string> = {
    A1: "Focus on basic greetings and simple phrases. Practice speaking slowly and clearly. 专注于基础问候和简单短语，慢慢说，说清楚。",
    A2: "Try to use complete sentences. Don't worry about mistakes - practice makes perfect! 尝试使用完整的句子，不要担心犯错——熟能生巧！",
    B1: "Challenge yourself with longer conversations. Try to use connecting words like 'however', 'therefore'. 挑战更长的对话，尝试使用连接词。",
    B2: "Focus on idiomatic expressions and natural flow. Try business and academic scenarios. 关注地道表达和自然流畅度，尝试商务和学术场景。",
    C1: "Work on nuance and precision. Practice debating and presenting complex ideas. 注重细微差别和精确性，练习辩论和表达复杂观点。",
    C2: "Maintain fluency through varied topics. Focus on cultural nuances and humor. 通过多样化话题保持流利度，关注文化细微差别和幽默。",
  };
  return tips[level] || tips.A2;
}

export type AppRouter = typeof appRouter;

export function resetTrialRateLimitersForTest() {
  chatLimiter.reset();
  voiceLimiter.reset();
  ttsLimiter.reset();
  translationCache.clear();
  wordLookupCache.clear();
}
