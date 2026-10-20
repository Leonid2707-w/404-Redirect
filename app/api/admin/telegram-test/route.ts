import { json, requireAdmin, runtimeEnv } from "@/lib/site-server";

export const dynamic = "force-dynamic";

type TelegramResponse = {
  ok?: boolean;
  description?: string;
};

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  if (!runtimeEnv.TELEGRAM_BOT_TOKEN || !runtimeEnv.TELEGRAM_CHAT_ID) {
    return json({ error: "Токен бота или ID канала не настроен" }, 400);
  }

  try {
    const endpoint = `https://api.telegram.org/bot${runtimeEnv.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: runtimeEnv.TELEGRAM_CHAT_ID,
        text: "✅ Тест 404 Team: подключение Telegram работает",
      }),
    });
    const result = (await response.json().catch(() => ({}))) as TelegramResponse;

    if (!response.ok || !result.ok) {
      const reason = String(result.description || `Telegram вернул код ${response.status}`).slice(0, 240);
      return json({ error: `Telegram: ${reason}` }, 502);
    }

    return json({ ok: true });
  } catch {
    return json({ error: "Не удалось подключиться к Telegram API" }, 502);
  }
}
