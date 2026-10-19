import {
  attributionCookie,
  cleanText,
  cookieValue,
  getCountry,
  getDatabase,
  getSettings,
  json,
  readAttribution,
  readJson,
  runtimeEnv,
  signedAttribution,
  visitorCookie,
} from "@/lib/site-server";

export const dynamic = "force-dynamic";

type TrackBody = {
  type?: "page_view" | "click";
  action?: string;
  page?: string;
  ref?: string;
  referrer?: string;
};

type LinkRow = {
  id: number;
  slug: string;
  label: string;
  source: string;
  account: string;
  campaign: string;
};

function actionLabel(action: string) {
  return ({ partner: "Стать партнёром", chat: "Чат веб-мастеров", channel: "Telegram-канал" } as Record<string, string>)[action] || action;
}

async function sendTelegram(event: TrackBody, link: LinkRow | null, visitorId: string, request: Request) {
  if (!runtimeEnv.TELEGRAM_BOT_TOKEN || !runtimeEnv.TELEGRAM_CHAT_ID) return;
  const settings = await getSettings();
  if (settings.telegram_enabled === "false") return;
  const time = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Asia/Yekaterinburg",
  }).format(new Date());
  const text = [
    "🔥 Новый клик на лендинге",
    `🔘 Кнопка: ${actionLabel(cleanText(event.action, 40))}`,
    `🏷 Метка: ${link?.label || "Без метки"}`,
    `📣 Источник: ${link?.source || "—"}`,
    `👤 Аккаунт: ${link?.account || "—"}`,
    `🎯 Кампания: ${link?.campaign || "—"}`,
    `🌍 GEO: ${getCountry(request)}`,
    `🆔 Visitor: ${visitorId.slice(0, 8)}`,
    `⏱ Время: ${time}`,
    `🔗 Link: ${link?.slug || "direct"}`,
  ].join("\n");
  const endpoint = `https://api.telegram.org/bot${runtimeEnv.TELEGRAM_BOT_TOKEN}/sendMessage`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: runtimeEnv.TELEGRAM_CHAT_ID, text }),
  });
  if (!response.ok) throw new Error(`Telegram returned ${response.status}`);
}

export async function POST(request: Request) {
  try {
    const body = await readJson<TrackBody>(request);
    if (!body.type || !["page_view", "click"].includes(body.type)) return json({ error: "Unknown event" }, 400);
    if (body.type === "click" && !["partner", "chat", "channel"].includes(body.action || "")) {
      return json({ error: "Unknown action" }, 400);
    }

    const db = getDatabase();
    const incomingRef = cleanText(body.ref, 64).toLowerCase();
    let attribution = await readAttribution(request);
    let setAttribution: string | null = null;

    if (!attribution && /^[a-z0-9_-]{2,64}$/.test(incomingRef)) {
      const candidate = await db
        .prepare("SELECT id, slug, label, source, account, campaign FROM tracking_links WHERE slug = ? AND active = 1")
        .bind(incomingRef)
        .first<LinkRow>();
      if (candidate) {
        attribution = candidate.slug;
        setAttribution = await signedAttribution(candidate.slug);
      }
    }

    const link = attribution
      ? await db
          .prepare("SELECT id, slug, label, source, account, campaign FROM tracking_links WHERE slug = ?")
          .bind(attribution)
          .first<LinkRow>()
      : null;

    let visitorId = cookieValue(request, "visitor_id");
    let setVisitor = false;
    if (!visitorId || !/^[0-9a-f-]{36}$/i.test(visitorId)) {
      visitorId = crypto.randomUUID();
      setVisitor = true;
    }

    await db
      .prepare(
        "INSERT INTO events (event_type, action, link_id, visitor_id, page, referrer, country, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        body.type,
        cleanText(body.action, 40),
        link?.id ?? null,
        visitorId,
        cleanText(body.page || "/", 300),
        cleanText(body.referrer, 500),
        getCountry(request),
        new Date().toISOString(),
      )
      .run();

    let telegramOk = true;
    if (body.type === "click") {
      try {
        await sendTelegram(body, link, visitorId, request);
      } catch {
        telegramOk = false;
      }
    }

    const headers = new Headers();
    if (setAttribution) headers.append("set-cookie", attributionCookie(request, setAttribution));
    if (setVisitor) headers.append("set-cookie", visitorCookie(request, visitorId));
    return json({ ok: true, attributedTo: link?.slug || null, telegramOk }, 200, headers);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Tracking failed" }, 500);
  }
}

