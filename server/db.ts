import { eq, desc, and, sql, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  scenarios, Scenario, InsertScenario,
  conversations, Conversation, InsertConversation,
  messages, MessageRecord, InsertMessage,
  learningRecords, LearningRecord, InsertLearningRecord,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { getMySqlPool } from "./_core/mysql";
let _db: ReturnType<typeof drizzle> | null = null;

// ==================== In-Memory Store (dev mode, no database) ====================
let _memNextId = 100;
const _memConversations: Map<number, Conversation> = new Map();
const _memMessages: Map<number, MessageRecord> = new Map();
function nextId() { return ++_memNextId; };

export async function getDb() {
  if (!_db) {
    const pool = getMySqlPool();
    if (!pool) return null;
    try {
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ==================== User Helpers ====================

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.authUserId) {
    throw new Error("User authUserId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values: InsertUser = { authUserId: user.authUserId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (
      typeof user.email === "string" &&
      user.email.trim().toLowerCase() === ENV.adminEmail
    ) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }
    if (!values.loginMethod) {
      values.loginMethod = "magic_link";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByAuthUserId(authUserId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(users)
    .where(eq(users.authUserId, authUserId))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserStats(userId: number, updates: {
  totalPracticeSeconds?: number;
  totalConversations?: number;
  avgPronunciationScore?: number;
  level?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(updates).where(eq(users.id, userId));
}

// ==================== Scenario Helpers ====================

/** In-memory mock scenarios used when no database is configured (dev mode) */
const MOCK_SCENARIOS: Scenario[] = [
  { id: 1, title: "Airport Check-in", titleZh: "机场值机", description: "Practice checking in at the airport, asking about gates, and handling luggage.", descriptionZh: "练习在机场办理值机手续、询问登机口和处理行李。", category: "travel", difficulty: "beginner", icon: "Plane", systemPrompt: "You are a friendly airport check-in staff member. Help the traveler check in for their flight. Ask for their passport, confirm their seat preference, and handle any baggage questions. Keep responses concise and natural.", openingMessage: "Good morning! Welcome to the check-in counter. May I see your passport and booking confirmation, please?", vocabulary: JSON.stringify(["boarding pass", "luggage", "gate", "passport", "seat preference"]) as any, isActive: 1, sortOrder: 1, createdAt: new Date() },
  { id: 2, title: "Restaurant Ordering", titleZh: "餐厅点餐", description: "Practice ordering food, asking about the menu, and handling dietary restrictions.", descriptionZh: "练习在餐厅点餐、询问菜单和处理饮食限制。", category: "daily", difficulty: "beginner", icon: "Utensils", systemPrompt: "You are a friendly waiter at a nice restaurant. Take the customer's order, answer questions about the menu, and make recommendations. Be warm and professional.", openingMessage: "Good evening! Welcome to our restaurant. My name is Alex and I'll be your server tonight. Can I start you off with something to drink?", vocabulary: JSON.stringify(["menu", "appetizer", "main course", "dessert", "vegetarian"]) as any, isActive: 1, sortOrder: 2, createdAt: new Date() },
  { id: 3, title: "Job Interview", titleZh: "求职面试", description: "Practice answering common interview questions and presenting yourself professionally.", descriptionZh: "练习回答常见面试问题并专业地展示自己。", category: "business", difficulty: "intermediate", icon: "Briefcase", systemPrompt: "You are a professional HR interviewer at a tech company. Conduct a job interview for a software engineer position. Ask about experience, skills, and behavioral questions.", openingMessage: "Hello! Thank you for coming in today. Please have a seat. I'm Sarah from HR. Before we start, could you briefly introduce yourself?", vocabulary: JSON.stringify(["resume", "experience", "qualifications", "strengths", "weaknesses"]) as any, isActive: 1, sortOrder: 3, createdAt: new Date() },
  { id: 4, title: "Hotel Check-in", titleZh: "酒店入住", description: "Practice checking into a hotel, requesting amenities, and handling room issues.", descriptionZh: "练习酒店入住、请求设施服务和处理房间问题。", category: "travel", difficulty: "beginner", icon: "Hotel", systemPrompt: "You are a helpful hotel receptionist. Assist the guest with check-in, explain hotel facilities, and handle any requests or complaints professionally.", openingMessage: "Welcome to Grand Hotel! Do you have a reservation with us today?", vocabulary: JSON.stringify(["reservation", "check-in", "room key", "amenities", "concierge"]) as any, isActive: 1, sortOrder: 4, createdAt: new Date() },
  { id: 5, title: "Doctor's Appointment", titleZh: "看医生", description: "Practice describing symptoms, asking medical questions, and understanding prescriptions.", descriptionZh: "练习描述症状、询问医疗问题和理解处方。", category: "daily", difficulty: "intermediate", icon: "Stethoscope", systemPrompt: "You are a friendly general practitioner. Listen to the patient's symptoms, ask follow-up questions, and provide medical advice. Be professional and reassuring.", openingMessage: "Good morning! I'm Dr. Johnson. What brings you in today?", vocabulary: JSON.stringify(["symptoms", "prescription", "diagnosis", "allergies", "medication"]) as any, isActive: 1, sortOrder: 5, createdAt: new Date() },
  { id: 6, title: "Business Meeting", titleZh: "商务会议", description: "Practice conducting or participating in a professional business meeting.", descriptionZh: "练习主持或参加专业商务会议。", category: "business", difficulty: "advanced", icon: "Users", systemPrompt: "You are a senior manager conducting a quarterly business review meeting. Discuss project updates, challenges, and strategic plans. Use professional business language.", openingMessage: "Good morning everyone. Let's get started with today's agenda. First, I'd like to review last quarter's performance.", vocabulary: JSON.stringify(["agenda", "quarterly", "KPI", "stakeholder", "deliverable"]) as any, isActive: 1, sortOrder: 6, createdAt: new Date() },
  { id: 7, title: "Shopping Assistant", titleZh: "购物助手", description: "Practice asking for help finding products, comparing items, and making purchases.", descriptionZh: "练习寻求帮助找商品、比较产品和购物结账。", category: "daily", difficulty: "beginner", icon: "ShoppingBag", systemPrompt: "You are a helpful store assistant at a clothing store. Help the customer find what they're looking for, suggest alternatives, and assist with the purchase.", openingMessage: "Hi there! Welcome to our store. Is there anything I can help you find today?", vocabulary: JSON.stringify(["size", "fitting room", "discount", "receipt", "exchange"]) as any, isActive: 1, sortOrder: 7, createdAt: new Date() },
  { id: 8, title: "Making New Friends", titleZh: "结交新朋友", description: "Practice small talk, introducing yourself, and building social connections.", descriptionZh: "练习闲聊、自我介绍和建立社交关系。", category: "social", difficulty: "beginner", icon: "Heart", systemPrompt: "You are a friendly person at a social gathering. Engage in casual conversation, ask about hobbies and interests, and share your own experiences. Be warm and encouraging.", openingMessage: "Hi! I don't think we've met before. I'm Jamie. Are you new here?", vocabulary: JSON.stringify(["hobby", "interest", "hometown", "weekend", "recommend"]) as any, isActive: 1, sortOrder: 8, createdAt: new Date() },
];

export async function getAllScenarios(): Promise<Scenario[]> {
  const db = await getDb();
  if (!db) return MOCK_SCENARIOS;
  return db.select().from(scenarios).where(eq(scenarios.isActive, 1)).orderBy(scenarios.sortOrder);
}

export async function getScenarioById(id: number): Promise<Scenario | undefined> {
  const db = await getDb();
  if (!db) return MOCK_SCENARIOS.find(s => s.id === id);
  const result = await db.select().from(scenarios).where(eq(scenarios.id, id)).limit(1);
  return result[0];
}

// ==================== Conversation Helpers ====================

export async function createConversation(data: InsertConversation): Promise<number> {
  const db = await getDb();
  if (!db) {
    const id = nextId();
    const now = new Date();
    _memConversations.set(id, { id, userId: data.userId ?? 1, scenarioId: data.scenarioId ?? null, title: data.title ?? "Free Conversation", status: data.status ?? "active", messageCount: 0, duration: 0, avgScore: null, feedback: null, grammarIssues: null, createdAt: now, updatedAt: now } as unknown as Conversation);
    return id;
  }
  const result = await db.insert(conversations).values(data);
  return result[0].insertId;
}
export async function getConversationById(id: number): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return _memConversations.get(id);
  const result = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return result[0];
}
export async function getUserConversations(userId: number, limit = 20, offset = 0) {
  const db = await getDb();
  if (!db) {
    return Array.from(_memConversations.values())
      .filter(c => c.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(offset, offset + limit);
  }
  return db.select().from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.createdAt))
    .limit(limit)
    .offset(offset);
}
export async function updateConversation(id: number, data: Partial<InsertConversation>) {
  const db = await getDb();
  if (!db) {
    const conv = _memConversations.get(id);
    if (conv) _memConversations.set(id, { ...conv, ...data, updatedAt: new Date() } as Conversation);
    return;
  }
  await db.update(conversations).set(data).where(eq(conversations.id, id));
}
// ==================== Message Helpers ====================
export async function createMessage(data: InsertMessage): Promise<number> {
  const db = await getDb();
  if (!db) {
    const id = nextId();
    const now = new Date();
    _memMessages.set(id, {
      id,
      conversationId: data.conversationId ?? 0,
      role: data.role ?? "user",
      content: data.content ?? "",
      audioUrl: data.audioUrl ?? null,
      audioObjectKey: data.audioObjectKey ?? null,
      audioContentType: data.audioContentType ?? null,
      pronunciationScore: data.pronunciationScore ?? null,
      pronunciationFeedback: data.pronunciationFeedback ?? null,
      grammarCorrections: data.grammarCorrections ?? null,
      expressionSuggestions: data.expressionSuggestions ?? null,
      createdAt: now,
    } as unknown as MessageRecord);
    return id;
  }
  const result = await db.insert(messages).values(data);
  return result[0].insertId;
}
export async function getConversationMessages(conversationId: number): Promise<MessageRecord[]> {
  const db = await getDb();
  if (!db) {
    return Array.from(_memMessages.values())
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  return db.select().from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);
}
export async function getMessageById(id: number): Promise<MessageRecord | undefined> {
  const db = await getDb();
  if (!db) {
    return _memMessages.get(id);
  }
  const result = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  return result[0];
}
// ==================== Message Update Helper ====================
export async function updateMessage(id: number, data: Partial<InsertMessage>) {
  const db = await getDb();
  if (!db) {
    const msg = _memMessages.get(id);
    if (msg) _memMessages.set(id, { ...msg, ...data } as MessageRecord);
    return;
  }
  await db.update(messages).set(data).where(eq(messages.id, id));
}

// ==================== Scenario Seed Helper ====================

export async function seedScenariosIfEmpty() {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select({ id: scenarios.id }).from(scenarios).limit(1);
  if (existing.length > 0) return; // Already seeded

  const defaultScenarios: InsertScenario[] = [
    {
      title: "Airport Check-in",
      titleZh: "机场值机",
      description: "Practice checking in at the airport, asking about gates, and handling luggage.",
      descriptionZh: "练习在机场办理值机手续、询问登机口和处理行李。",
      category: "travel",
      difficulty: "beginner",
      icon: "Plane",
      systemPrompt: "You are a friendly airport check-in staff member. Help the traveler check in for their flight. Ask for their passport, confirm their seat preference, and handle any baggage questions. Keep responses concise and natural.",
      openingMessage: "Good morning! Welcome to the check-in counter. May I see your passport and booking confirmation, please?",
      vocabulary: JSON.stringify(["boarding pass", "luggage", "gate", "passport", "seat preference", "carry-on", "check-in", "departure"]) as any,
      isActive: 1,
      sortOrder: 1,
    },
    {
      title: "Restaurant Ordering",
      titleZh: "餐厅点餐",
      description: "Practice ordering food, asking about the menu, and handling dietary restrictions.",
      descriptionZh: "练习在餐厅点餐、询问菜单和处理饮食限制。",
      category: "daily",
      difficulty: "beginner",
      icon: "Utensils",
      systemPrompt: "You are a friendly waiter at a nice restaurant. Take the customer's order, answer questions about the menu, and make recommendations. Be warm and professional.",
      openingMessage: "Good evening! Welcome to our restaurant. My name is Alex and I'll be your server tonight. Can I start you off with something to drink?",
      vocabulary: JSON.stringify(["menu", "appetizer", "main course", "dessert", "vegetarian", "allergies", "reservation", "bill"]) as any,
      isActive: 1,
      sortOrder: 2,
    },
    {
      title: "Job Interview",
      titleZh: "求职面试",
      description: "Practice answering common interview questions and presenting yourself professionally.",
      descriptionZh: "练习回答常见面试问题并专业地展示自己。",
      category: "business",
      difficulty: "intermediate",
      icon: "Briefcase",
      systemPrompt: "You are a professional HR interviewer at a tech company. Conduct a job interview for a software engineer position. Ask about experience, skills, and behavioral questions. Be professional but friendly.",
      openingMessage: "Hello! Thank you for coming in today. Please have a seat. I'm Sarah from HR. Before we start, could you briefly introduce yourself?",
      vocabulary: JSON.stringify(["resume", "experience", "qualifications", "strengths", "weaknesses", "team player", "deadline", "project management"]) as any,
      isActive: 1,
      sortOrder: 3,
    },
    {
      title: "Hotel Check-in",
      titleZh: "酒店入住",
      description: "Practice checking into a hotel, requesting amenities, and handling room issues.",
      descriptionZh: "练习酒店入住、请求设施服务和处理房间问题。",
      category: "travel",
      difficulty: "beginner",
      icon: "Hotel",
      systemPrompt: "You are a helpful hotel receptionist. Assist the guest with check-in, explain hotel facilities, and handle any requests or complaints professionally.",
      openingMessage: "Welcome to Grand Hotel! Do you have a reservation with us today?",
      vocabulary: JSON.stringify(["reservation", "check-in", "room key", "amenities", "concierge", "checkout", "room service", "Wi-Fi"]) as any,
      isActive: 1,
      sortOrder: 4,
    },
    {
      title: "Doctor's Appointment",
      titleZh: "看医生",
      description: "Practice describing symptoms, understanding medical advice, and asking health questions.",
      descriptionZh: "练习描述症状、理解医疗建议和询问健康问题。",
      category: "daily",
      difficulty: "intermediate",
      icon: "Stethoscope",
      systemPrompt: "You are a caring doctor at a clinic. Listen to the patient's symptoms, ask follow-up questions, and provide clear medical advice. Use simple language the patient can understand.",
      openingMessage: "Hello! I'm Dr. Johnson. What brings you in today? How are you feeling?",
      vocabulary: JSON.stringify(["symptoms", "prescription", "diagnosis", "appointment", "medication", "allergy", "blood pressure", "follow-up"]) as any,
      isActive: 1,
      sortOrder: 5,
    },
    {
      title: "Business Meeting",
      titleZh: "商务会议",
      description: "Practice presenting ideas, discussing projects, and participating in business meetings.",
      descriptionZh: "练习展示想法、讨论项目和参与商务会议。",
      category: "business",
      difficulty: "advanced",
      icon: "Users",
      systemPrompt: "You are a senior manager leading a business meeting. Discuss quarterly results, project updates, and strategic plans. Encourage participation and ask for opinions.",
      openingMessage: "Good morning everyone. Let's get started. We have a lot to cover today. First, let's review last quarter's performance. Who'd like to kick things off?",
      vocabulary: JSON.stringify(["agenda", "quarterly report", "KPI", "stakeholder", "ROI", "action items", "follow-up", "deliverables"]) as any,
      isActive: 1,
      sortOrder: 6,
    },
    {
      title: "Shopping at a Store",
      titleZh: "购物",
      description: "Practice asking for help finding items, comparing products, and making purchases.",
      descriptionZh: "练习寻求帮助找商品、比较产品和购物结账。",
      category: "daily",
      difficulty: "beginner",
      icon: "ShoppingBag",
      systemPrompt: "You are a helpful store assistant at a clothing store. Help the customer find what they're looking for, suggest alternatives, and assist with the purchase.",
      openingMessage: "Hi there! Welcome to our store. Is there anything I can help you find today?",
      vocabulary: JSON.stringify(["size", "fitting room", "discount", "receipt", "exchange", "refund", "sale", "cashier"]) as any,
      isActive: 1,
      sortOrder: 7,
    },
    {
      title: "University Campus Life",
      titleZh: "大学校园生活",
      description: "Practice discussing courses, campus activities, and student life in English.",
      descriptionZh: "练习用英语讨论课程、校园活动和学生生活。",
      category: "academic",
      difficulty: "intermediate",
      icon: "GraduationCap",
      systemPrompt: "You are a friendly university student advisor. Help the student navigate campus life, discuss course selection, and answer questions about university resources.",
      openingMessage: "Hey! Welcome to the student advisory office. Are you a new student? What can I help you with today?",
      vocabulary: JSON.stringify(["semester", "credits", "major", "elective", "GPA", "scholarship", "campus", "extracurricular"]) as any,
      isActive: 1,
      sortOrder: 8,
    },
    {
      title: "Making New Friends",
      titleZh: "结交新朋友",
      description: "Practice small talk, introducing yourself, and building social connections.",
      descriptionZh: "练习闲聊、自我介绍和建立社交关系。",
      category: "social",
      difficulty: "beginner",
      icon: "Heart",
      systemPrompt: "You are a friendly person at a social gathering. Engage in casual conversation, ask about hobbies and interests, and share your own experiences. Be warm and encouraging.",
      openingMessage: "Hi! I don't think we've met before. I'm Jamie. Are you new here?",
      vocabulary: JSON.stringify(["hobby", "interest", "hometown", "weekend", "recommend", "hang out", "catch up", "get together"]) as any,
      isActive: 1,
      sortOrder: 9,
    },
    {
      title: "Negotiating a Deal",
      titleZh: "商务谈判",
      description: "Practice negotiating prices, terms, and conditions in a business context.",
      descriptionZh: "练习在商业环境中谈判价格、条款和条件。",
      category: "business",
      difficulty: "advanced",
      icon: "Handshake",
      systemPrompt: "You are a business partner in a negotiation meeting. Discuss contract terms, pricing, and partnership conditions. Be firm but open to compromise.",
      openingMessage: "Thank you for meeting with us today. We're very interested in moving forward with this partnership. Shall we start by reviewing the proposed terms?",
      vocabulary: JSON.stringify(["contract", "terms", "negotiate", "compromise", "deadline", "budget", "partnership", "agreement"]) as any,
      isActive: 1,
      sortOrder: 10,
    },
  ];

  await db.insert(scenarios).values(defaultScenarios);
  console.log(`[Database] Seeded ${defaultScenarios.length} scenarios`);
}

// ==================== Learning Record Helpers ====================

export async function upsertLearningRecord(data: InsertLearningRecord) {
  const db = await getDb();
  if (!db) return;
  await db.insert(learningRecords).values(data).onDuplicateKeyUpdate({
    set: {
      practiceSeconds: sql`${learningRecords.practiceSeconds} + ${data.practiceSeconds ?? 0}`,
      conversationCount: sql`${learningRecords.conversationCount} + ${data.conversationCount ?? 0}`,
      wordsSpoken: sql`${learningRecords.wordsSpoken} + ${data.wordsSpoken ?? 0}`,
      avgPronunciationScore: data.avgPronunciationScore,
      weakAreas: data.weakAreas,
    },
  });
}

export async function getUserLearningRecords(userId: number, days = 30): Promise<LearningRecord[]> {
  const db = await getDb();
  if (!db) return [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const dateStr = startDate.toISOString().split("T")[0];
  return db.select().from(learningRecords)
    .where(and(eq(learningRecords.userId, userId), gte(learningRecords.date, dateStr)))
    .orderBy(learningRecords.date);
}

export async function getUserDashboardStats(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const user = await db.select({
    totalPracticeSeconds: users.totalPracticeSeconds,
    totalConversations: users.totalConversations,
    avgPronunciationScore: users.avgPronunciationScore,
    level: users.level,
  }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user[0]) return null;

  const recentRecords = await getUserLearningRecords(userId, 30);
  const recentConversations = await db.select().from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.createdAt))
    .limit(5);

  return {
    ...user[0],
    recentRecords,
    recentConversations,
  };
}
