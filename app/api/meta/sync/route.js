// Syncs campaign-level insights for one ad account + month
// POST /api/meta/sync   body: { metaAccountId: "123456789", month: "2026-06" }

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = body?.accessToken?.trim() || process.env.META_ACCESS_TOKEN;
  const ver = body?.apiVersion?.trim() || process.env.META_API_VERSION || "v21.0";
  const { metaAccountId, month } = body;

  if (!token) {
    return Response.json({ error: "Meta access token is required." }, { status: 400 });
  }

  if (!metaAccountId || !month) {
    return Response.json({ error: "metaAccountId and month are required" }, { status: 400 });
  }

  const [year, mon] = month.split("-").map(Number);
  const since = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon, 0).getDate();
  const until = `${year}-${String(mon).padStart(2, "0")}-${lastDay}`;

  const actId = metaAccountId.startsWith("act_")
    ? metaAccountId
    : `act_${metaAccountId}`;

  try {
    const campUrl =
      `https://graph.facebook.com/${ver}/${actId}/campaigns` +
      `?fields=name,status,objective` +
      `&limit=200` +
      `&access_token=${token}`;

    const campRes = await fetch(campUrl, { cache: "no-store" });
    const campJson = await campRes.json();

    if (campJson.error) {
      return Response.json({ error: campJson.error.message, code: campJson.error.code }, { status: 400 });
    }

    const campaignMeta = {};
    for (const c of campJson.data || []) {
      campaignMeta[c.id] = {
        name: c.name,
        status: c.status === "ACTIVE" ? "Active" : "Inactive",
        objective: c.objective || "",
      };
    }

    const insightsUrl =
      `https://graph.facebook.com/${ver}/${actId}/insights` +
      `?level=campaign` +
      `&fields=campaign_id,campaign_name,date_start,date_stop,spend,impressions,clicks,ctr,actions,cost_per_action_type` +
      `&time_range=${encodeURIComponent(JSON.stringify({ since, until }))}` +
      `&time_increment=7` +
      `&limit=500` +
      `&access_token=${token}`;

    const insRes = await fetch(insightsUrl, { cache: "no-store" });
    const insJson = await insRes.json();

    if (insJson.error) {
      return Response.json({ error: insJson.error.message, code: insJson.error.code }, { status: 400 });
    }

    const map = {};

    for (const row of insJson.data || []) {
      const cid = row.campaign_id;

      if (!map[cid]) {
        const resultInfo = detectResult(row.actions);
        map[cid] = {
          campaignId: cid,
          name: row.campaign_name,
          status: campaignMeta[cid]?.status || "Active",
          resultType: resultInfo.type,
          spend: 0,
          results: 0,
          impressions: 0,
          clicks: 0,
          weeklyResults: [0, 0, 0, 0, 0],
        };
      }

      const entry = map[cid];
      const spend = parseFloat(row.spend || 0);
      const impressions = parseInt(row.impressions || 0);
      const clicks = parseInt(row.clicks || 0);

      entry.spend += spend;
      entry.impressions += impressions;
      entry.clicks += clicks;

      const resultInfo = detectResult(row.actions);
      const weekIndex = getWeekIndexForMonth(row.date_start, year, mon);
      entry.results += resultInfo.count;
      entry.weeklyResults[weekIndex] += resultInfo.count;

      if (entry.resultType === "Unknown" && resultInfo.type !== "Unknown") {
        entry.resultType = resultInfo.type;
      }
    }

    const campaigns = Object.values(map).map((c) => {
      return {
        name: c.name,
        status: c.status,
        resultType: c.resultType,
        spend: Math.round(c.spend * 100) / 100,
        results: c.results,
        impressions: c.impressions,
        clicks: c.clicks,
        weeks: c.weeklyResults,
      };
    });

    return Response.json({
      campaigns,
      month,
      metaAccountId,
      syncedAt: Date.now(),
    });
  } catch (err) {
    return Response.json({ error: "Failed to reach Meta API: " + err.message }, { status: 502 });
  }
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

function detectResult(actions) {
  if (!actions || !Array.isArray(actions)) {
    return { type: "Unknown", count: 0 };
  }

  const PRIORITY = [
    { match: "onsite_conversion.messaging_conversation_started_7d", label: "Messaging" },
    { match: "onsite_conversion.messaging_first_reply", label: "Messaging" },
    { match: "lead", label: "Leads" },
    { match: "complete_registration", label: "Registrations" },
    { match: "purchase", label: "Purchases" },
    { match: "add_to_cart", label: "Add to Cart" },
    { match: "link_click", label: "Link Clicks" },
    { match: "landing_page_view", label: "Landing Page Views" },
    { match: "video_view", label: "Video Views" },
    { match: "post_engagement", label: "Engagement" },
    { match: "page_engagement", label: "Engagement" },
  ];

  for (const p of PRIORITY) {
    const found = actions.find((a) => a.action_type === p.match);
    if (found) {
      return { type: p.label, count: parseInt(found.value || 0) };
    }
  }

  if (actions.length > 0) {
    return {
      type: actions[0].action_type?.replace(/_/g, " ") || "Actions",
      count: parseInt(actions[0].value || 0),
    };
  }

  return { type: "Unknown", count: 0 };
}
