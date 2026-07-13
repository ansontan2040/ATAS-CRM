// Fetches ad accounts owned by a Meta Business Portfolio.
// GET  /api/meta/accounts              -> uses environment variables
// POST /api/meta/accounts              -> body: { businessId, accessToken, apiVersion? }

const STATUS_MAP = {
  1: "Active",
  2: "Disabled",
  3: "Unsettled",
  7: "Pending Review",
  9: "In Grace Period",
  100: "Pending Closure",
  101: "Closed",
};

function normalizeConfig(value) {
  return {
    accessToken: value?.accessToken?.trim() || process.env.META_ACCESS_TOKEN || "",
    businessId: value?.businessId?.trim() || process.env.META_BUSINESS_ID || "",
    apiVersion: value?.apiVersion?.trim() || process.env.META_API_VERSION || "v21.0",
  };
}

async function listAccounts(config) {
  if (!config.accessToken || !config.businessId) {
    return Response.json(
      { error: "Meta access token and Business Portfolio ID are required." },
      { status: 400 }
    );
  }

  try {
    const url =
      `https://graph.facebook.com/${config.apiVersion}/${config.businessId}/owned_ad_accounts` +
      `?fields=id,name,account_id,account_status,currency,timezone_name` +
      `&limit=100` +
      `&access_token=${config.accessToken}`;

    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json();

    if (json.error) {
      return Response.json(
        { error: json.error.message, code: json.error.code },
        { status: 400 }
      );
    }

    const accounts = (json.data || []).map((account) => ({
      metaAccountId: account.account_id,
      actId: account.id,
      name: account.name,
      status: STATUS_MAP[account.account_status] || `Unknown (${account.account_status})`,
      currency: account.currency || "USD",
      timezone: account.timezone_name || "",
    }));

    return Response.json({ accounts });
  } catch (error) {
    return Response.json(
      { error: `Failed to reach Meta API: ${error.message}` },
      { status: 502 }
    );
  }
}

export async function GET() {
  return listAccounts(normalizeConfig());
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return listAccounts(normalizeConfig(body));
}
