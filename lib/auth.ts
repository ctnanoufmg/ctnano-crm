import { redirect } from "next/navigation";
import { createAdminClient } from "./supabase/admin";
import { createSupabaseServerClient } from "./supabase/server";
import { hasCrmAccess, type CrmRole } from "./access";

export type CrmSessionUser = {
  id: number;
  authUserId: string;
  fullName: string;
  email: string;
  phone: string;
  role: CrmRole;
  active: boolean;
};

function mapProfile(row: Record<string, unknown>): CrmSessionUser {
  return {
    id: Number(row.id),
    authUserId: String(row.auth_user_id ?? ""),
    fullName: String(row.full_name ?? ""),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    role: row.role as CrmRole,
    active: Boolean(row.active),
  };
}

export async function getCrmSessionUser(): Promise<CrmSessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return null;

  const admin = createAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("crm_users")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (profileError || !profile) return null;
  const mapped = mapProfile(profile);
  return hasCrmAccess(mapped, user) ? mapped : null;
}

export async function requireCrmPageUser() {
  const user = await getCrmSessionUser();
  if (!user) redirect("/login?erro=sem-acesso");
  return user;
}

export async function requireCrmApiUser() {
  const user = await getCrmSessionUser();
  if (!user) return { user: null, response: Response.json({ error: "Sessão inválida ou usuário sem acesso." }, { status: 401 }) };
  return { user, response: null };
}

export function requireAdmin(user: CrmSessionUser) {
  return user.role === "admin";
}
