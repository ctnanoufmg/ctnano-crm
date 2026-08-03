import { getSnapshot } from "../../../db/crm";
import { createCrmExcel } from "../../../lib/excel-export";
import { requireCrmApiUser } from "../../../lib/auth";

export async function GET() {
  const auth = await requireCrmApiUser();
  if (auth.response) return auth.response;
  try {
    const snapshot = await getSnapshot();
    const workbook = createCrmExcel(snapshot as unknown as Parameters<typeof createCrmExcel>[0]);
    const today = new Date().toISOString().slice(0, 10);
    const body = workbook.buffer.slice(workbook.byteOffset, workbook.byteOffset + workbook.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="ctnano-crm-dados-${today}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao exportar a planilha do Excel." }, { status: 500 });
  }
}
