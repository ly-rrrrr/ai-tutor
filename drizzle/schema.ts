import {
  float,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  authUserId: varchar("authUserId", { length: 255 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }).default("password"),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  /** CEFR level: A1, A2, B1, B2, C1, C2 */
  level: varchar("level", { length: 4 }).default("A2"),
  /** Total practice seconds */
  totalPracticeSeconds: int("totalPracticeSeconds").default(0),
  /** Total conversations completed */
  totalConversations: int("totalConversations").default(0),
  /** Average pronunciation score (0-100) */
  avgPronunciationScore: float("avgPronunciationScore").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const authUsers = mysqlTable("auth_users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  emailVerified: int("emailVerified").default(0).notNull(),
  image: text("image"),
  username: varchar("username", { length: 255 }),
  displayUsername: varchar("displayUsername", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  emailUnique: uniqueIndex("auth_users_email_unique").on(table.email),
  usernameUnique: uniqueIndex("auth_users_username_unique").on(table.username),
}));

export const authSessions = mysqlTable("auth_sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  token: varchar("token", { length: 255 }).notNull(),
  userId: varchar("userId", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  ipAddress: varchar("ipAddress", { length: 255 }),
  userAgent: text("userAgent"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  tokenUnique: uniqueIndex("auth_sessions_token_unique").on(table.token),
}));

export const authAccounts = mysqlTable("auth_accounts", {
  id: varchar("id", { length: 255 }).primaryKey(),
  accountId: varchar("accountId", { length: 255 }).notNull(),
  providerId: varchar("providerId", { length: 255 }).notNull(),
  userId: varchar("userId", { length: 255 }).notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  providerAccountUnique: uniqueIndex("auth_accounts_provider_account_unique").on(
    table.providerId,
    table.accountId
  ),
}));

export const authVerifications = mysqlTable("auth_verifications", {
  id: varchar("id", { length: 255 }).primaryKey(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: varchar("value", { length: 255 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  valueUnique: uniqueIndex("auth_verifications_value_unique").on(
    table.value
  ),
}));

/**
 * Scenario categories for conversation practice
 */
export const scenarios = mysqlTable("scenarios", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  titleZh: varchar("titleZh", { length: 200 }).notNull(),
  description: text("description").notNull(),
  descriptionZh: text("descriptionZh").notNull(),
  category: mysqlEnum("category", ["daily", "travel", "business", "academic", "social"]).notNull(),
  difficulty: mysqlEnum("difficulty", ["beginner", "intermediate", "advanced"]).notNull(),
  icon: varchar("icon", { length: 50 }).default("MessageCircle"),
  /** System prompt for the AI tutor in this scenario */
  systemPrompt: text("systemPrompt").notNull(),
  /** Opening message from AI */
  openingMessage: text("openingMessage").notNull(),
  /** Suggested vocabulary for this scenario */
  vocabulary: json("vocabulary").$type<string[]>(),
  isActive: int("isActive").default(1),
  sortOrder: int("sortOrder").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Scenario = typeof scenarios.$inferSelect;
export type InsertScenario = typeof scenarios.$inferInsert;

/**
 * Conversation sessions between user and AI tutor
 */
export const conversations = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  scenarioId: int("scenarioId"),
  title: varchar("title", { length: 200 }),
  /** Duration in seconds */
  duration: int("duration").default(0),
  /** Number of messages exchanged */
  messageCount: int("messageCount").default(0),
  /** Average pronunciation score for this conversation */
  avgScore: float("avgScore"),
  /** Summary feedback from AI */
  feedback: text("feedback"),
  /** Grammar issues found: JSON array */
  grammarIssues: json("grammarIssues").$type<Array<{ original: string; corrected: string; explanation: string }>>(),
  status: mysqlEnum("status", ["active", "completed", "archived"]).default("active"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = typeof conversations.$inferInsert;

/**
 * Individual messages within a conversation
 */
export const messages = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull(),
  role: mysqlEnum("role", ["user", "assistant", "system"]).notNull(),
  content: text("content").notNull(),
  /** Audio URL if message was spoken */
  audioUrl: varchar("audioUrl", { length: 500 }),
  /** Durable storage object key for uploaded or generated audio */
  audioObjectKey: varchar("audioObjectKey", { length: 500 }),
  /** Content type for the stored audio object */
  audioContentType: varchar("audioContentType", { length: 255 }),
  /** Pronunciation score for user messages (0-100) */
  pronunciationScore: float("pronunciationScore"),
  /** Detailed pronunciation feedback JSON */
  pronunciationFeedback: json("pronunciationFeedback").$type<{
    accuracy: number;
    fluency: number;
    completeness: number;
    suggestions: string[];
  }>(),
  /** Grammar corrections for user messages */
  grammarCorrections: json("grammarCorrections").$type<Array<{
    original: string;
    corrected: string;
    explanation: string;
  }>>(),
  /** Better expression suggestions */
  expressionSuggestions: json("expressionSuggestions").$type<Array<{
    original: string;
    better: string;
    reason: string;
  }>>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MessageRecord = typeof messages.$inferSelect;
export type InsertMessage = typeof messages.$inferInsert;

/**
 * Daily learning records for tracking progress
 */
export const learningRecords = mysqlTable("learningRecords", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  practiceSeconds: int("practiceSeconds").default(0),
  conversationCount: int("conversationCount").default(0),
  avgPronunciationScore: float("avgPronunciationScore"),
  wordsSpoken: int("wordsSpoken").default(0),
  /** Weak areas identified: JSON array of categories */
  weakAreas: json("weakAreas").$type<string[]>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LearningRecord = typeof learningRecords.$inferSelect;
export type InsertLearningRecord = typeof learningRecords.$inferInsert;
