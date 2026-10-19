import { getDatabase, json, requireAdmin } from "@/lib/site-server";

export const dynamic = "force-dynamic";

function cutoffFor(raw: string | null) {
  if (raw === "all") return null;
  const days = [7, 30, 90].includes(Number(raw)) ? Number(raw) : 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const cutoff = cutoffFor(new URL(request.url).searchParams.get("days"));
  const db = getDatabase();
  const where = cutoff ? "WHERE e.created_at >= ?" : "";
  const joinCondition = cutoff ? "AND e.created_at >= ?" : "";

  const totalsStatement = db.prepare(`
    SELECT
      SUM(CASE WHEN e.event_type = 'page_view' THEN 1 ELSE 0 END) AS views,
      COUNT(DISTINCT CASE WHEN e.event_type = 'page_view' THEN e.visitor_id END) AS visitors,
      SUM(CASE WHEN e.event_type = 'click' THEN 1 ELSE 0 END) AS clicks,
      COUNT(DISTINCT CASE WHEN e.event_type = 'click' THEN e.visitor_id END) AS unique_clicks,
      SUM(CASE WHEN e.event_type = 'click' AND e.action = 'partner' THEN 1 ELSE 0 END) AS partner_clicks,
      SUM(CASE WHEN e.event_type = 'click' AND e.action = 'chat' THEN 1 ELSE 0 END) AS chat_clicks,
      SUM(CASE WHEN e.event_type = 'click' AND e.action = 'channel' THEN 1 ELSE 0 END) AS channel_clicks
    FROM events e ${where}
  `);
  const linksStatement = db.prepare(`
    SELECT l.id, l.slug, l.label, l.source, l.account, l.campaign, l.active,
      SUM(CASE WHEN e.event_type = 'page_view' THEN 1 ELSE 0 END) AS views,
      COUNT(DISTINCT CASE WHEN e.event_type = 'page_view' THEN e.visitor_id END) AS visitors,
      SUM(CASE WHEN e.event_type = 'click' THEN 1 ELSE 0 END) AS clicks,
      COUNT(DISTINCT CASE WHEN e.event_type = 'click' THEN e.visitor_id END) AS unique_clicks,
      SUM(CASE WHEN e.event_type = 'click' AND e.action = 'partner' THEN 1 ELSE 0 END) AS partner_clicks,
      SUM(CASE WHEN e.event_type = 'click' AND e.action = 'chat' THEN 1 ELSE 0 END) AS chat_clicks,
      SUM(CASE WHEN e.event_type = 'click' AND e.action = 'channel' THEN 1 ELSE 0 END) AS channel_clicks
    FROM tracking_links l
    LEFT JOIN events e ON e.link_id = l.id ${joinCondition}
    GROUP BY l.id
    ORDER BY views DESC, clicks DESC, l.id DESC
  `);
  const timelineStatement = db.prepare(`
    SELECT substr(e.created_at, 1, 10) AS day,
      SUM(CASE WHEN e.event_type = 'page_view' THEN 1 ELSE 0 END) AS views,
      SUM(CASE WHEN e.event_type = 'click' THEN 1 ELSE 0 END) AS clicks
    FROM events e ${where}
    GROUP BY day ORDER BY day ASC
  `);
  const recentStatement = db.prepare(`
    SELECT e.id, e.event_type, e.action, e.country, e.page, e.created_at,
      l.slug, l.label, l.source, l.account
    FROM events e LEFT JOIN tracking_links l ON l.id = e.link_id
    ${where}
    ORDER BY e.id DESC LIMIT 40
  `);

  const bind = <T extends D1PreparedStatement>(statement: T) => (cutoff ? statement.bind(cutoff) : statement);
  const [totals, links, timeline, recent] = await db.batch([
    bind(totalsStatement),
    bind(linksStatement),
    bind(timelineStatement),
    bind(recentStatement),
  ]);

  return json({
    totals: totals.results?.[0] || {},
    links: links.results || [],
    timeline: timeline.results || [],
    recent: recent.results || [],
  });
}
