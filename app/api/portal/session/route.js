import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  clearPortalSession,
  clearSharedSession,
  createPortalSession,
  createSharedSession,
  hashPortalPassword,
  isCrmAuthConfigured,
  isCrmSessionConfigured,
  readPortalSession,
} from "@/lib/crm-auth";
import { isSharedStorageConfigured, readCrmState } from "@/lib/crm-state";

export const dynamic = "force-dynamic";

function summarizeUser(user, clients = []) {
  const linkedClient = clients.find((item) => item.id === user.clientId);

  return {
    id: user.id,
    role: user.role === "client" ? "client" : "admin",
    clientId: user.clientId || null,
    clientName: linkedClient?.name || "",
    displayName: user.displayName || user.username,
    username: user.username,
  };
}

function notConfigured() {
  if (!isSharedStorageConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        authenticated: false,
        error: "Shared CRM storage is not configured yet.",
        code: "storage_not_configured",
      },
      { status: 503 }
    );
  }

  if (!isCrmSessionConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        authenticated: false,
        error: "CRM session secret is not configured yet.",
        code: "auth_not_configured",
      },
      { status: 503 }
    );
  }

  return null;
}

export async function GET() {
  const configError = notConfigured();
  if (configError) {
    return configError;
  }

  const cookieStore = cookies();
  const session = readPortalSession(cookieStore);
  if (!session) {
    return NextResponse.json({ configured: true, authenticated: false, user: null });
  }

  try {
    const { state } = await readCrmState();
    const user = state.clientUsers.find(
      (item) =>
        item.id === session.userId &&
        item.role === session.role &&
        item.isActive !== false
    );

    if (!user) {
      clearPortalSession(cookieStore);
      clearSharedSession(cookieStore);
      return NextResponse.json({ configured: true, authenticated: false, user: null });
    }

    return NextResponse.json({
      configured: true,
      authenticated: true,
      user: summarizeUser(user, state.clients),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Could not load portal session: ${error.message}`,
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const configError = notConfigured();
  if (configError) {
    return configError;
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  try {
    const { state } = await readCrmState();
    const user = state.clientUsers.find(
      (item) => item.username === username && item.isActive !== false
    );

    if (!user || user.passwordHash !== hashPortalPassword(password)) {
      return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
    }

    const cookieStore = cookies();
    createPortalSession(user, cookieStore);

    if (user.role === "admin" && isCrmAuthConfigured()) {
      createSharedSession(cookieStore);
    } else {
      clearSharedSession(cookieStore);
    }

    return NextResponse.json({
      configured: true,
      authenticated: true,
      user: summarizeUser(user, state.clients),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Could not sign in to the CRM portal: ${error.message}`,
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const cookieStore = cookies();
  clearPortalSession(cookieStore);
  clearSharedSession(cookieStore);
  return NextResponse.json({ ok: true, authenticated: false, user: null });
}
