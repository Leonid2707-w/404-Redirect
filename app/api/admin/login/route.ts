import { createAdminSession, credentialsAreValid, json, readJson, sessionCookie } from "@/lib/site-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ login?: string; password?: string }>(request);
    if (!(await credentialsAreValid(String(body.login || ""), String(body.password || "")))) {
      return json({ error: "Неверный логин или пароль" }, 401);
    }
    const session = await createAdminSession(String(body.login));
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(request, session, 8 * 60 * 60) });
  } catch {
    return json({ error: "Не удалось выполнить вход" }, 400);
  }
}

