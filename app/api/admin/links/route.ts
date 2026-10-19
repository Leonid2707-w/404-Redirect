import { cleanText, getDatabase, json, randomSlug, readJson, requireAdmin } from "@/lib/site-server";

export const dynamic = "force-dynamic";

type LinkInput = {
  slug?: string;
  label?: string;
  source?: string;
  account?: string;
  campaign?: string;
};

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const result = await getDatabase()
    .prepare("SELECT id, slug, label, source, account, campaign, active, created_at FROM tracking_links ORDER BY id DESC")
    .all();
  return json({ links: result.results || [] });
}

export async function POST(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await readJson<LinkInput>(request);
    const label = cleanText(body.label, 100);
    if (!label) return json({ error: "Укажите подпись ссылки" }, 400);
    const db = getDatabase();
    let slug = cleanText(body.slug, 64).toLowerCase();
    if (slug && !/^[a-z0-9_-]{2,64}$/.test(slug)) {
      return json({ error: "Slug: 2–64 символа, латиница, цифры, _ или -" }, 400);
    }
    if (!slug) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = randomSlug();
        const exists = await db.prepare("SELECT id FROM tracking_links WHERE slug = ?").bind(candidate).first();
        if (!exists) {
          slug = candidate;
          break;
        }
      }
    }
    if (!slug) return json({ error: "Не удалось создать код ссылки" }, 500);
    await db
      .prepare(
        "INSERT INTO tracking_links (slug, label, source, account, campaign, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
      )
      .bind(
        slug,
        label,
        cleanText(body.source, 100),
        cleanText(body.account, 100),
        cleanText(body.campaign, 100),
        new Date().toISOString(),
      )
      .run();
    return json({ ok: true, slug });
  } catch (error) {
    const message = error instanceof Error && /unique/i.test(error.message) ? "Такой slug уже существует" : "Не удалось создать ссылку";
    return json({ error: message }, 400);
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const body = await readJson<LinkInput & { id?: number; active?: boolean }>(request);
    const id = Number(body.id);
    if (!Number.isInteger(id) || id < 1) return json({ error: "Некорректная ссылка" }, 400);
    const existing = await getDatabase().prepare("SELECT id FROM tracking_links WHERE id = ?").bind(id).first();
    if (!existing) return json({ error: "Ссылка не найдена" }, 404);
    await getDatabase()
      .prepare("UPDATE tracking_links SET label = ?, source = ?, account = ?, campaign = ?, active = ? WHERE id = ?")
      .bind(
        cleanText(body.label, 100),
        cleanText(body.source, 100),
        cleanText(body.account, 100),
        cleanText(body.campaign, 100),
        body.active === false ? 0 : 1,
        id,
      )
      .run();
    return json({ ok: true });
  } catch {
    return json({ error: "Не удалось обновить ссылку" }, 400);
  }
}

