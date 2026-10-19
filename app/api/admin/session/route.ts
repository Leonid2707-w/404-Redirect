import { isAdmin, json } from "@/lib/site-server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return json({ authenticated: await isAdmin(request) });
}
