// Fetches all ad accounts owned by the Business Portfolio
// GET /api/meta/accounts

export async function GET() {
  const token = process.env.META_ACCESS_TOKEN;
  const bizId = process.env.META_BUSINESS_ID;
  const ver   = process.env.META_API_VERSION || "v21.0";

  if (!token || !bizId) {
    return Response.json(
      { error: "META_ACCESS_TOKEN or META_BUSINESS_ID not configured" },
      { status: 500 }
    );
  }

  try {
    // Fetch owned ad accounts
    const url =
      `https://graph.facebook.com/${ver}/${bizId}/owned_ad_accounts` +
      `?fields=name,account_id,account_status,currency,timezone_name` +
      `&limit=100` +
      `&access_token=${token}`;

    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    if (json.error) {
      return Response.json(
        { error: json.error.message, code: json.error.code },
        { status: 400 }
      );
    }

    // Normalize: account_status 1 = ACTIVE, 2 = DISABLED, 3 = UNSETTLED, etc.
    const STATUS_MAP = { 1: "Active", 2: "Disabled", 3: "Unsettled", 7: "Pending Review", 9: "In Grace Period", 100: "Pending Closure", 101: "Closed" };

    const accounts = (json.data || []).map((a) => ({
      metaAccountId: a.account_id,            // numeric, e.g. "123456789"
      actId:         a.id,                      // prefixed, e.g. "act_123456789"
      name:          a.name,
      status:        STATUS_MAP[a.account_status] || `Unknown (${a.account_status})`,
      currency:      a.currency || "USD",
      timezone:      a.timezone_name || "",
    }));

    return Response.json({ accounts });
  } catch (err) {
    return Response.json(
      { error: "Failed to reach Meta API: " + err.message },
      { status: 502 }
    );
  }
}
