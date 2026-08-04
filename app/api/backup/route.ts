import { getSnapshot } from "../../../db/crm";
import { requireAdmin, requireCrmApiUser } from "../../../lib/auth";
import { createAdminClient } from "../../../lib/supabase/admin";

function base64url(value: string | ArrayBuffer) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  return Buffer.from(bytes).toString("base64url");
}

async function googleAccessToken(clientEmail: string, privateKey: string) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64url(JSON.stringify({ iss: clientEmail, scope: "https://www.googleapis.com/auth/drive.file", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }))}`;
  const pem = privateKey.replace(/\\n/g, "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Buffer.from(pem, "base64"), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${base64url(signature)}` }) });
  if (!response.ok) throw new Error("O Google recusou a autenticação do backup.");
  const result = await response.json() as { access_token: string };
  return result.access_token;
}

async function appsScriptBackup(webAppUrl: string, token: string, fileName: string, content: string) {
  const response = await fetch(webAppUrl, {
    method: "POST",
    redirect: "follow",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token, fileName, content }),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; id?: string; name?: string; error?: string } | null;
  if (!response.ok || !result?.ok || !result.id || !result.name) {
    throw new Error(result?.error ? `Não foi possível enviar o arquivo ao Google Drive: ${result.error}` : "Não foi possível enviar o arquivo ao Google Drive.");
  }
  return { id: result.id, name: result.name };
}

export async function POST() {
  const auth = await requireCrmApiUser();
  if (auth.response || !auth.user) return auth.response;
  if (!requireAdmin(auth.user)) return Response.json({ error: "Somente administradores podem criar backups." }, { status: 403 });
  const webAppUrl = process.env.GDRIVE_WEB_APP_URL;
  const backupToken = process.env.GDRIVE_BACKUP_TOKEN;
  const clientEmail = process.env.GDRIVE_CLIENT_EMAIL;
  const privateKey = process.env.GDRIVE_PRIVATE_KEY;
  const folderId = process.env.GDRIVE_FOLDER_ID;
  const appsScriptConfigured = Boolean(webAppUrl && backupToken);
  const serviceAccountConfigured = Boolean(clientEmail && privateKey && folderId);
  if (!appsScriptConfigured && !serviceAccountConfigured) return Response.json({ error: "A integração com o Google Drive ainda não foi configurada." }, { status: 412 });
  try {
    const snapshot = await getSnapshot();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `ctnano-crm-backup-${stamp}.json`;
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), product: "CTNano CRM", version: 3, data: snapshot }, null, 2);
    let file: { id: string; name: string };
    if (webAppUrl && backupToken) {
      file = await appsScriptBackup(webAppUrl, backupToken, fileName, body);
    } else {
      const token = await googleAccessToken(clientEmail!, privateKey!);
      const boundary = `ctnano_${crypto.randomUUID()}`;
      const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fileName, parents: [folderId], mimeType: "application/json" })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
      const upload = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` }, body: multipart });
      const uploadResult = await upload.json().catch(() => null) as { id?: string; name?: string; error?: { message?: string } } | null;
      if (!upload.ok || !uploadResult?.id || !uploadResult.name) {
        const detail = uploadResult?.error?.message;
        throw new Error(detail ? `Não foi possível enviar o arquivo ao Google Drive: ${detail}` : "Não foi possível enviar o arquivo ao Google Drive.");
      }
      file = { id: uploadResult.id, name: uploadResult.name };
    }
    const db = createAdminClient();
    const { error } = await db.from("backups").insert({ status: "Sucesso", file_name: file.name, drive_file_id: file.id });
    if (error) throw new Error(error.message);
    return Response.json({ message: "Backup criado no Google Drive.", snapshot: await getSnapshot() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao criar backup." }, { status: 500 });
  }
}
