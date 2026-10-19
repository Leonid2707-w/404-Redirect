import { getSettings, json } from "@/lib/site-server";

export const dynamic = "force-dynamic";

const defaults = {
  partner_url: "https://404team.space/?ref=4qmUp5GA",
  chat_url: "https://t.me/+rwtcQpWbn8NiZjhi",
  channel_url: "",
};

export async function GET() {
  try {
    const settings = await getSettings();
    return json({
      links: {
        partner: settings.partner_url ?? defaults.partner_url,
        chat: settings.chat_url ?? defaults.chat_url,
        channel: settings.channel_url ?? defaults.channel_url,
      },
    });
  } catch {
    return json({ links: { partner: defaults.partner_url, chat: defaults.chat_url, channel: defaults.channel_url } });
  }
}

