import crypto from "node:crypto";

import { cookies } from "next/headers";

const SESSION_COOKIE = "crm_shared_session";
const PORTAL_SESSION_COOKIE = "crm_portal_session";

function digest(value) {
  return crypto.createHash("sha256").update(value).digest();
}

function safeEqual(a, b) {
  const left = digest(a);
  const right = digest(b);
  return crypto.timingSafeEqual(left, right);
}

function expectedSessionValue() {
  return crypto
    .createHmac("sha256", process.env.CRM_SESSION_SECRET)
    .update(`crm-session:${process.env.CRM_SHARED_PASSWORD}`)
    .digest("hex");
}

function signPortalSession(userId, role) {
  return crypto
    .createHmac("sha256", process.env.CRM_SESSION_SECRET)
    .update(`crm-portal:${userId}:${role}`)
    .digest("hex");
}

function setSessionCookie(cookieStore, name, value, maxAge) {
  cookieStore.set(name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export function hashPortalPassword(password) {
  return crypto.createHash("sha256").update(String(password || "")).digest("hex");
}

export function isCrmSessionConfigured() {
  return Boolean(process.env.CRM_SESSION_SECRET);
}

export function isCrmAuthConfigured() {
  return Boolean(process.env.CRM_SHARED_PASSWORD && isCrmSessionConfigured());
}

export function verifySharedPassword(password) {
  if (!isCrmAuthConfigured() || typeof password !== "string") {
    return false;
  }

  return safeEqual(password, process.env.CRM_SHARED_PASSWORD);
}

export function hasSharedSession(cookieStore = cookies()) {
  if (!isCrmAuthConfigured()) {
    return false;
  }

  const current = cookieStore.get(SESSION_COOKIE)?.value;
  return Boolean(current && safeEqual(current, expectedSessionValue()));
}

export function createSharedSession(cookieStore = cookies()) {
  setSessionCookie(cookieStore, SESSION_COOKIE, expectedSessionValue(), 60 * 60 * 24 * 30);
}

export function clearSharedSession(cookieStore = cookies()) {
  setSessionCookie(cookieStore, SESSION_COOKIE, "", 0);
}

export function readPortalSession(cookieStore = cookies()) {
  if (!isCrmSessionConfigured()) {
    return null;
  }

  const raw = cookieStore.get(PORTAL_SESSION_COOKIE)?.value;
  if (!raw) {
    return null;
  }

  const [userId, role, signature] = raw.split(".");
  if (!userId || !role || !signature) {
    return null;
  }

  const expected = signPortalSession(userId, role);
  if (!safeEqual(signature, expected)) {
    return null;
  }

  return {
    userId,
    role: role === "client" ? "client" : "admin",
  };
}

export function createPortalSession(user, cookieStore = cookies()) {
  if (!isCrmSessionConfigured() || !user?.id) {
    return;
  }

  const role = user.role === "client" ? "client" : "admin";
  const signature = signPortalSession(user.id, role);
  setSessionCookie(cookieStore, PORTAL_SESSION_COOKIE, `${user.id}.${role}.${signature}`, 60 * 60 * 24 * 30);
}

export function clearPortalSession(cookieStore = cookies()) {
  setSessionCookie(cookieStore, PORTAL_SESSION_COOKIE, "", 0);
}
