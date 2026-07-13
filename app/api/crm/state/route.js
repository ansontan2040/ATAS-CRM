import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  hasSharedSession,
  isCrmAuthConfigured,
  readPortalSession,
} from "@/lib/crm-auth";
import {
  isSharedStorageConfigured,
  normalizeCrmState,
  readCrmState,
  writeCrmState,
} from "@/lib/crm-state";

export const dynamic = "force-dynamic";

function notConfigured() {
  if (!isSharedStorageConfigured()) {
    return NextResponse.json(
      {
        error: "Shared CRM storage is not configured. Add a Vercel Blob store first.",
        code: "storage_not_configured",
      },
      { status: 503 }
    );
  }

  if (!isCrmAuthConfigured()) {
    return NextResponse.json(
      {
        error: "Shared CRM auth is not configured. Add CRM_SHARED_PASSWORD and CRM_SESSION_SECRET.",
        code: "auth_not_configured",
      },
      { status: 503 }
    );
  }

  return null;
}

function unauthorized() {
  return NextResponse.json(
    {
      error: "Please sign in to access the CRM portal.",
      code: "unauthorized",
    },
    { status: 401 }
  );
}

function forbidden() {
  return NextResponse.json(
    {
      error: "Only admin users can change CRM data.",
      code: "forbidden",
    },
    { status: 403 }
  );
}

function filterStateForClient(state, user) {
  const linkedClient = state.clients.find((item) => item.id === user.clientId);
  const allowedIds = new Set(linkedClient?.accountIds || []);

  return normalizeCrmState({
    contacts: [],
    deals: [],
    accounts: state.accounts.filter((item) => allowedIds.has(item.id)),
    campaigns: state.campaigns.filter((item) => allowedIds.has(item.accountId)),
    metaConnections: [],
    clients: linkedClient ? [linkedClient] : [],
    clientUsers: [],
    syncMap: state.syncMap,
  });
}

function resolvePortalUser(state) {
  const session = readPortalSession(cookies());
  if (!session) {
    return null;
  }

  return (
    state.clientUsers.find(
      (item) =>
        item.id === session.userId &&
        item.role === session.role &&
        item.isActive !== false
    ) || null
  );
}

export async function GET() {
  const configError = notConfigured();
  if (configError) {
    return configError;
  }

  try {
    const { state } = await readCrmState();
    const portalUser = resolvePortalUser(state);
    const isSharedAdmin = hasSharedSession(cookies());

    if (!isSharedAdmin && !portalUser) {
      return unauthorized();
    }

    return NextResponse.json({
      state: portalUser?.role === "client" ? filterStateForClient(state, portalUser) : state,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Could not load shared CRM data: ${error.message}`,
      },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
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

  try {
    const { state } = await readCrmState();
    const portalUser = resolvePortalUser(state);
    const isSharedAdmin = hasSharedSession(cookies());

    if (!isSharedAdmin && !portalUser) {
      return unauthorized();
    }

    if (portalUser?.role === "client") {
      return forbidden();
    }

    const savedState = await writeCrmState(normalizeCrmState(body?.state));
    return NextResponse.json({ state: savedState });
  } catch (error) {
    return NextResponse.json(
      {
        error: `Could not save shared CRM data: ${error.message}`,
      },
      { status: 500 }
    );
  }
}
