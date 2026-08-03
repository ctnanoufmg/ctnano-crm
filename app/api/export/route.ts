import { getSnapshot } from "../../../db/crm";
import { requireAdmin, requireCrmApiUser } from "../../../lib/auth";

export async function GET() {
  const auth = await requireCrmApiUser();
  if (auth.response || !auth.user) return auth.response;
  if (!requireAdmin(auth.user)) return Response.json({ error: "Somente administradores podem exportar o backup integral." }, { status: 403 });
  try {
    const snapshot = await getSnapshot();
    const today = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), product: "CTNano CRM", version: 2, data: snapshot }, null, 2), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="ctnano-crm-backup-${today}.json"` },
    });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erro ao exportar." }, { status: 500 }); }
}
