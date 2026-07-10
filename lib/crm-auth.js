import crypto from "node:crypto";

import { cookies } from "next/headers";

const SESSION_COOKIE = "crm_shared_session";

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

export function isCrmAuthConfigured() {
  return Boolean(process.env.CRM_SHARED_PASSWORD && process.env.CRM_SESSION_SECRET);
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
  cookieStore.set(SESSION_COOKIE, expectedSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSharedSession(cookieStore = cookies()) {
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
