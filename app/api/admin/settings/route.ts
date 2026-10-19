import { cleanUrl, getDatabase, getSettings, json, readJson, requireAdmin, runtimeEnv } from "@/lib/site-server";

export const dynamic = "force-dynamic";

const defaults = {
  partner_url: "https://404team.space/?ref=4qmUp5GA",
  chat_url: "https://t.me/+rwtcQpWbn8NiZjhi",
  channel_url: "",
  telegram_enabled: "true",
};

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const settings = { ...defaults, ...(await getSettings()) };
  return json({
    settings,
    telegram: {
      tokenConfigured: Boolean(runtimeEnv.TELEGRAM_BOT_TOKEN),
      chatConfigured: Boolean(runtimeEnv.TELEGRAM_CHAT_ID),
    },
  });
}

export async function PUT(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const values: Record<string, string> = {
      partner_url: cleanUrl(body.partner_url),
      chat_url: cleanUrl(body.chat_url),
      channel_url: body.channel_url ? cleanUrl(body.channel_url) : "",
      telegram_enabled: body.telegram_enabled === false ? "false" : "true",
    };
    if (!values.partner_url || !values.chat_url) return json({ error: "Заполните ссылки двух основных кнопок" }, 400);
    const db = getDatabase();
    await db.batch(
      Object.entries(values).map(([key, value]) =>
        db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, value),
      ),
    );
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Не удалось сохранить настройки" }, 400);
  }
}

