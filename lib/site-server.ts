import { getPostgresDatabase } from "@/lib/server-db";

type RuntimeEnv = {
  ADMIN_LOGIN?: string;
  ADMIN_PASSWORD?: string;
  SESSION_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
};

export const runtimeEnv: RuntimeEnv = {
  ADMIN_LOGIN: process.env.ADMIN_LOGIN,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID,
};

export function getDatabase() {
  return getPostgresDatabase();
}

export function json(data: unknown, status = 200, headers?: HeadersInit) {
  return Response.json(data, { status, headers });
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) throw new Error("Expected JSON");
  return request.json() as Promise<T>;
}

export function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function base64Url(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeText(value: string) {
  return base64Url(new TextEncoder().encode(value));
}

function decodeText(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function hmac(value: string) {
  const secret = runtimeEnv.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64Url(new Uint8Array(signature));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(bytes));
}

export async function credentialsAreValid(login: string, password: string) {
  const configuredLogin = runtimeEnv.ADMIN_LOGIN || "";
  const configuredPassword = runtimeEnv.ADMIN_PASSWORD || "";
  const [provided, expected] = await Promise.all([
    digest(`${login}\u0000${password}`),
    digest(`${configuredLogin}\u0000${configuredPassword}`),
  ]);
  return Boolean(configuredLogin && configuredPassword && timingSafeEqual(provided, expected));
}

export async function createAdminSession(login: string) {
  const payload = encodeText(JSON.stringify({ login, exp: Date.now() + 8 * 60 * 60 * 1000 }));
  return `${payload}.${await hmac(payload)}`;
}

export async function isAdmin(request: Request) {
  const token = cookieValue(request, "admin_session");
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = await hmac(payload);
  if (!timingSafeEqual(signature, expected)) return false;
  try {
    const parsed = JSON.parse(decodeText(payload)) as { login?: string; exp?: number };
    return parsed.login === runtimeEnv.ADMIN_LOGIN && Number(parsed.exp) > Date.now();
  } catch {
    return false;
  }
}

export async function requireAdmin(request: Request) {
  if (!(await isAdmin(request))) return json({ error: "Необходим вход" }, 401);
  return null;
}

export function sessionCookie(request: Request, value: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `admin_session=${encodeURIComponent(value)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

export async function signedAttribution(slug: string) {
  const payload = `${slug}.${Date.now()}`;
  return `${payload}.${await hmac(payload)}`;
}

export async function readAttribution(request: Request) {
  const token = cookieValue(request, "attribution");
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [slug, timestamp, signature] = parts;
  if (!/^[a-z0-9_-]{2,64}$/.test(slug)) return null;
  if (Date.now() - Number(timestamp) > 90 * 24 * 60 * 60 * 1000) return null;
  const expected = await hmac(`${slug}.${timestamp}`);
  return timingSafeEqual(signature, expected) ? slug : null;
}

export function attributionCookie(request: Request, value: string) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `attribution=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7776000${secure}`;
}

export function visitorCookie(request: Request, value: string) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `visitor_id=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${secure}`;
}

export function randomSlug(length = 8) {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export function cleanText(value: unknown, maxLength = 120) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function cleanUrl(value: unknown) {
  const input = cleanText(value, 1000);
  if (!input) return "";
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only http(s) URLs are allowed");
  return url.toString();
}

export function getCountry(request: Request) {
  const cf = (request as Request & { cf?: { country?: string } }).cf;
  return cleanText(
    cf?.country || request.headers.get("x-vercel-ip-country") || request.headers.get("cf-ipcountry") || "—",
    8,
  );
}

export async function getSettings() {
  const db = getDatabase();
  const result = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  return Object.fromEntries((result.results || []).map((row) => [row.key, row.value]));
}

