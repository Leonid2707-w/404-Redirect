import { json, sessionCookie } from "@/lib/site-server";

export async function POST(request: Request) {
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(request, "", 0) });
}

