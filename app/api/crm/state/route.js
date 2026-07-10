import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { hasSharedSession, isCrmAuthConfigured } from "@/lib/crm-auth";
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
      error: "Please sign in to access shared CRM sync.",
      code: "unauthorized",
    },
    { status: 401 }
  );
}

export async function GET() {
  const configError = notConfigured();
  if (configError) {
    return configError;
  }

  if (!hasSharedSession(cookies())) {
    return unauthorized();
  }

  try {
    const { state } = await readCrmState();
    return NextResponse.json({ state });
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

  if (!hasSharedSession(cookies())) {
    return unauthorized();
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
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
