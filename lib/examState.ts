// lib/examState.ts
// Server-side source of truth for each student's strikes / lock, plus saved
// answers. Vercel functions don't share memory, so production uses Upstash
// Redis. In dev (no env vars) it falls back to in-memory storage.
import { Redis } from "@upstash/redis";

export interface ExamState {
  locked: boolean;
  strikes: number;
  updatedAt: number;
}

const EMPTY: ExamState = { locked: false, strikes: 0, updatedAt: 0 };

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

// Dev-only fallback. Survives hot reloads, but is NOT shared across
// serverless instances, so it must never be used in production.
const g = globalThis as unknown as {
  __proctoriaMem?: {
    states: Map<string, ExamState>;
    answers: Map<string, Record<string, string>>;
  };
};
const mem = (g.__proctoriaMem ??= { states: new Map(), answers: new Map() });

function requireStore() {
  if (!redis && process.env.NODE_ENV === "production") {
    throw new Error("Upstash Redis env vars are not set; refusing to run without a shared store");
  }
}

const STATE_KEY = "proctoria:exam-state";

function normalize(v: unknown): ExamState {
  if (!v) return { ...EMPTY };
  const o = (typeof v === "string" ? JSON.parse(v) : v) as Partial<ExamState>;
  return {
    locked: Boolean(o.locked),
    strikes: Number(o.strikes) || 0,
    updatedAt: Number(o.updatedAt) || 0,
  };
}

export async function getState(studentId: string): Promise<ExamState> {
  requireStore();
  if (redis) return normalize(await redis.hget(STATE_KEY, studentId));
  return mem.states.get(studentId) ?? { ...EMPTY };
}

export async function putState(studentId: string, s: Pick<ExamState, "locked" | "strikes">) {
  requireStore();
  const full: ExamState = { ...s, updatedAt: Date.now() };
  if (redis) await redis.hset(STATE_KEY, { [studentId]: full });
  else mem.states.set(studentId, full);
  return full;
}

export async function listStates(): Promise<Record<string, ExamState>> {
  requireStore();
  if (redis) {
    const all = (await redis.hgetall<Record<string, unknown>>(STATE_KEY)) ?? {};
    return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, normalize(v)]));
  }
  return Object.fromEntries(mem.states);
}

export async function saveAnswer(
  examId: string,
  studentId: string,
  questionId: string,
  answer: string
) {
  requireStore();
  const key = `proctoria:answers:${examId}:${studentId}`;
  if (redis) {
    await redis.hset(key, { [questionId]: answer });
  } else {
    const cur = mem.answers.get(key) ?? {};
    cur[questionId] = answer;
    mem.answers.set(key, cur);
  }
}