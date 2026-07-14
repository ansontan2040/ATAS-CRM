// Syncs campaign-level Google Ads performance for one customer + month.
// POST /api/google/sync body: { googleCustomerId: "1234567890", month: "2026-06" }

const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v17";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const googleCustomerId = String(body?.googleCustomerId || "").replace(/\D/g, "");
  const month = body?.month;

  if (!googleCustomerId || !month) {
    return Response.json({ error: "googleCustomerId and month are required" }, { status: 400 });
  }

  if (!isGoogleAdsConfigured()) {
    return Response.json({
      configured: false,
      campaigns: [],
      month,
      googleCustomerId,
      syncedAt: Date.now(),
    });
  }

  const [year, mon] = String(month).split("-").map(Number);
  if (!year || !mon) {
    return Response.json({ error: "month must use YYYY-MM format" }, { status: 400 });
  }

  const since = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const until = `${year}-${String(mon).padStart(2, "0")}-${lastDay}`;

  try {
    const accessToken = await getGoogleAccessToken();
    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.cost_micros,
        metrics.conversions,
        metrics.impressions,
        metrics.clicks,
        metrics.ctr,
        segments.week
      FROM campaign
      WHERE segments.date BETWEEN '${since}' AND '${until}'
        AND campaign.status != 'REMOVED'
    `;

    const response = await fetch(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${googleCustomerId}/googleAds:searchStream`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
          ...(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
            ? { "login-customer-id": process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/\D/g, "") }
            : {}),
        },
        body: JSON.stringify({ query }),
      }
    );

    const payload = await response.json();
    if (!response.ok) {
      return Response.json(
        { error: extractGoogleError(payload) || "Google Ads API request failed." },
        { status: 400 }
      );
    }

    const map = {};
    for (const batch of Array.isArray(payload) ? payload : []) {
      for (const row of batch.results || []) {
        const campaign = row.campaign || {};
        const metrics = row.metrics || {};
        const segments = row.segments || {};
        const campaignId = String(campaign.id || "");

        if (!campaignId) continue;

        if (!map[campaignId]) {
          map[campaignId] = {
            campaignId,
            name: campaign.name || "Untitled campaign",
            status: campaign.status === "ENABLED" ? "Active" : "Inactive",
            resultType: "Conversions",
            spend: 0,
            results: 0,
            impressions: 0,
            clicks: 0,
            weeklyResults: [0, 0, 0, 0, 0],
          };
        }

        const entry = map[campaignId];
        const conversions = Number(metrics.conversions || 0);
        entry.spend += Number(metrics.costMicros || 0) / 1_000_000;
        entry.results += conversions;
        entry.impressions += Number(metrics.impressions || 0);
        entry.clicks += Number(metrics.clicks || 0);
        entry.weeklyResults[getWeekIndexForMonth(segments.week, year, mon)] += conversions;
      }
    }

    const campaigns = Object.values(map).map((campaign) => ({
      name: campaign.name,
      status: campaign.status,
      resultType: campaign.resultType,
      spend: Math.round(campaign.spend * 100) / 100,
      results: Math.round(campaign.results * 100) / 100,
      impressions: campaign.impressions,
      clicks: campaign.clicks,
      weeks: campaign.weeklyResults.map((value) => Math.round(value * 100) / 100),
    }));

    return Response.json({
      configured: true,
      campaigns,
      month,
      googleCustomerId,
      syncedAt: Date.now(),
    });
  } catch (error) {
    return Response.json({ error: "Failed to reach Google Ads API: " + error.message }, { status: 502 });
  }
}

function isGoogleAdsConfigured() {
  return Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
      process.env.GOOGLE_ADS_CLIENT_ID &&
      process.env.GOOGLE_ADS_CLIENT_SECRET &&
      process.env.GOOGLE_ADS_REFRESH_TOKEN
  );
}

async function getGoogleAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_ADS_CLIENT_ID,
      client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Could not refresh Google Ads access token.");
  }

  return payload.access_token;
}

function getWeekIndexForMonth(dateStart, year, month) {
  if (typeof dateStart === "string") {
    const parsed = new Date(`${dateStart}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      const parsedYear = parsed.getUTCFullYear();
      const parsedMonth = parsed.getUTCMonth() + 1;
      const parsedDay = parsed.getUTCDate();

      if (parsedYear === year && parsedMonth === month) {
        return Math.min(4, Math.floor((parsedDay - 1) / 7));
      }
    }
  }

  return 0;
}

function extractGoogleError(payload) {
  if (typeof payload?.error?.message === "string") {
    return payload.error.message;
  }

  if (Array.isArray(payload) && payload[0]?.error?.message) {
    return payload[0].error.message;
  }

  return null;
}
