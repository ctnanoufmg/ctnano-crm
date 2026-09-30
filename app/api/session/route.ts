import { requireCrmApiUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireCrmApiUser();
  if (auth.response || !auth.user) return auth.response;
  return Response.json({ role: auth.user.role }, { headers: { "Cache-Control": "private, no-store" } });
}
