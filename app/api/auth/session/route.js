import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import {
  clearSharedSession,
  createSharedSession,
  hasSharedSession,
  isCrmAuthConfigured,
  verifySharedPassword,
} from "@/lib/crm-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = cookies();

  return NextResponse.json({
    configured: isCrmAuthConfigured(),
    authenticated: hasSharedSession(cookieStore),
  });
}

export async function POST(request) {
  if (!isCrmAuthConfigured()) {
    return NextResponse.json(
      {
        error: "Shared sync password is not configured.",
        code: "auth_not_configured",
      },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!verifySharedPassword(body?.password)) {
    return NextResponse.json(
      { error: "Incorrect shared sync password." },
      { status: 401 }
    );
  }

  createSharedSession(cookies());

  return NextResponse.json({ ok: true, authenticated: true });
}

export async function DELETE() {
  clearSharedSession(cookies());
  return NextResponse.json({ ok: true, authenticated: false });
}
