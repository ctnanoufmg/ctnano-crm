import { getSnapshot, entityTables, toDatabase, type CrmEntity } from "../../../db/crm";
import { requireAdmin, requireCrmApiUser } from "../../../lib/auth";
import { createAdminClient } from "../../../lib/supabase/admin";

const entities = new Set<CrmEntity>(["users", "companies", "contacts", "opportunities", "activities", "projects", "kpis"]);
const actions = new Set(["create", "update", "delete"]);
const responsibleEntities = new Set<CrmEntity>(["companies", "contacts", "opportunities", "activities", "projects", "kpis"]);
const ADMIN_EMAIL = "ricardo.neres@ctnano.org";
const entityLabels: Record<CrmEntity, string> = {
  users: "Usuário",
  companies: "Organização",
  contacts: "Contato",
  opportunities: "Oportunidade",
  activities: "Atividade",
  projects: "Projeto",
  kpis: "Indicador",
};

const systemKpiMethods: Record<string, string> = {
  mapped_companies: "Organizações do tipo Empresa cadastradas no ano",
  prospected_companies: "Contatos prospectados no ano",
  technical_proposals: "Propostas técnicas enviadas no ano",
  contracted_projects: "Projetos contratados no ano",
  contracting_companies: "Empresas contratantes únicas no ano",
  mpe_startup: "Startups/MPEs contratantes no ano",
  average_negotiation_time: "Tempo médio de negociação concluída no ano",
  average_contracting_time: "Tempo médio de contratação concluída no ano",
};

function clean(values: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(values).filter(([key]) => !["id", "createdAt", "updatedAt", "authUserId"].includes(key)));
}

function elapsedDays(start?: string, end?: string) {
  if (!start || !end) return 0;
  const startTime = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  const endTime = Date.parse(`${end.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return -1;
  return Math.floor((endTime - startTime) / 86400000);
}

function addDays(value: string, days: number) {
  const result = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function isValidCnpj(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return true;
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calculateDigit = (base: string, weights: number[]) => {
    const sum = base.split("").reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculateDigit(digits.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
}

function formatCnpj(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "";
}

async function averageContractingDays() {
  const db = createAdminClient();
  const { data, error } = await db.from("opportunities").select("accepted_date,contract_date").not("accepted_date", "is", null).not("contract_date", "is", null);
  if (error) throw new Error(error.message);
  const durations = (data ?? []).map((item) => elapsedDays(item.accepted_date, item.contract_date)).filter((days) => days >= 0);
  return durations.length ? Math.round(durations.reduce((sum, days) => sum + days, 0) / durations.length) : null;
}

export async function GET() {
  const auth = await requireCrmApiUser();
  if (auth.response) return auth.response;
  try { return Response.json(await getSnapshot()); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Erro ao carregar o CRM." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const auth = await requireCrmApiUser();
  if (auth.response || !auth.user) return auth.response;
  try {
    const payload = await request.json() as { action?: "create" | "update" | "delete"; entity?: CrmEntity; data?: Record<string, unknown> };
    if (!payload.action || !actions.has(payload.action) || !payload.entity || !entities.has(payload.entity) || !payload.data) return Response.json({ error: "Operação inválida." }, { status: 400 });
    if ((payload.action === "delete" || ["kpis", "users"].includes(payload.entity)) && !requireAdmin(auth.user)) return Response.json({ error: "Somente administradores podem realizar esta operação." }, { status: 403 });

    const db = createAdminClient();
    const values = clean(payload.data);
    const id = Number(payload.data.id);
    if (["update", "delete"].includes(payload.action) && !id) return Response.json({ error: "ID inválido." }, { status: 400 });

    if (payload.action === "delete") {
      const table = entityTables[payload.entity];
      const { data: existing, error: lookupError } = await db.from(table).select("*").eq("id", id).maybeSingle();
      if (lookupError) throw new Error(lookupError.message);
      if (!existing) return Response.json({ error: `${entityLabels[payload.entity]} não encontrado.` }, { status: 404 });

      if (payload.entity === "kpis" && (systemKpiMethods[String(existing.key)] || !String(existing.key).startsWith("custom_"))) {
        return Response.json({ error: "Indicadores automáticos do sistema não podem ser excluídos." }, { status: 400 });
      }

      if (payload.entity === "users") {
        const email = String(existing.email ?? "").toLowerCase();
        if (email === ADMIN_EMAIL) return Response.json({ error: "O administrador principal do sistema não pode ser excluído." }, { status: 400 });
        if (id === auth.user.id) return Response.json({ error: "Você não pode excluir o seu próprio usuário." }, { status: 400 });
      }

      if (payload.entity === "companies") {
        const linkedResults = await Promise.all([
          db.from("contacts").select("id", { count: "exact", head: true }).eq("company_id", id),
          db.from("opportunities").select("id", { count: "exact", head: true }).eq("company_id", id),
          db.from("projects").select("id", { count: "exact", head: true }).eq("company_id", id),
        ]);
        const linkedError = linkedResults.find((result) => result.error)?.error;
        if (linkedError) throw new Error(linkedError.message);
        const [contacts, opportunities, projects] = linkedResults.map((result) => result.count ?? 0);
        if (contacts || opportunities || projects) {
          const links = [contacts && `${contacts} contato(s)`, opportunities && `${opportunities} oportunidade(s)`, projects && `${projects} projeto(s)`].filter(Boolean).join(", ");
          return Response.json({ error: `Esta organização possui registros vinculados (${links}). Exclua esses registros primeiro para preservar a integridade do histórico.` }, { status: 409 });
        }
      }

      const authUserId = payload.entity === "users" ? String(existing.auth_user_id ?? "") : "";
      const { error } = await db.from(table).delete().eq("id", id);
      if (error) throw new Error(error.message);
      if (authUserId) {
        const { error: authDeleteError } = await db.auth.admin.deleteUser(authUserId);
        if (authDeleteError) return Response.json({ ...await getSnapshot(), message: `O acesso ao CRM foi removido. A conta de autenticação não pôde ser apagada automaticamente e pode ser removida em Authentication > Users no Supabase: ${authDeleteError.message}` });
      }
      return Response.json({ ...await getSnapshot(), message: `${entityLabels[payload.entity]} excluído com sucesso.` });
    }

    if (payload.entity === "users") {
      const fullName = String(values.fullName ?? "").trim();
      const email = String(values.email ?? "").trim().toLowerCase();
      const phone = String(values.phone ?? "").trim();
      let role = values.role === "admin" ? "admin" : "user";
      let active = values.active !== false;
      if (!fullName) return Response.json({ error: "Informe o nome completo do usuário." }, { status: 400 });
      if (!/^[^\s@]+@ctnano\.org$/i.test(email)) return Response.json({ error: "Somente e-mails @ctnano.org podem ser cadastrados." }, { status: 400 });
      if (email === ADMIN_EMAIL) { role = "admin"; active = true; }
      if (payload.action === "update" && id === auth.user.id && (role !== "admin" || !active)) return Response.json({ error: "Você não pode remover seu próprio acesso administrativo." }, { status: 400 });

      if (payload.action === "create") {
        const redirectTo = `${new URL(request.url).origin}/auth/callback`;
        const { data: invitation, error: invitationError } = await db.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: fullName, phone } });
        if (invitationError && !invitationError.message.toLowerCase().includes("already")) return Response.json({ error: `Não foi possível convidar o usuário: ${invitationError.message}` }, { status: 400 });
        const authUserId = invitation.user?.id ?? null;
        const profileValues: Record<string, unknown> = { full_name: fullName, email, phone, role, active };
        if (authUserId) profileValues.auth_user_id = authUserId;
        const { data: saved, error } = await db.from("crm_users").upsert(profileValues, { onConflict: "email" }).select("id").single();
        if (error) throw new Error(error.message);
        return Response.json({ ...await getSnapshot(), saved: { entity: payload.entity, id: saved.id } });
      }

      const { data: existing, error: existingError } = await db.from("crm_users").select("auth_user_id,email").eq("id", id).single();
      if (existingError) throw new Error(existingError.message);
      if (existing.auth_user_id && existing.email !== email) {
        const { error: authUpdateError } = await db.auth.admin.updateUserById(existing.auth_user_id, { email, user_metadata: { full_name: fullName, phone } });
        if (authUpdateError) return Response.json({ error: authUpdateError.message }, { status: 400 });
      }
      Object.assign(values, { fullName, email, phone, role, active });
    }

    if (responsibleEntities.has(payload.entity)) {
      const responsibleUserId = Number(values.responsibleUserId);
      if (!responsibleUserId) return Response.json({ error: "Selecione a pessoa responsável pelo cadastro." }, { status: 400 });
      const { data: responsible, error } = await db.from("crm_users").select("id,full_name,active").eq("id", responsibleUserId).single();
      if (error || !responsible) return Response.json({ error: "A pessoa responsável selecionada não foi encontrada." }, { status: 400 });
      if (!responsible.active && payload.action === "create") return Response.json({ error: "Selecione uma pessoa responsável ativa." }, { status: 400 });
      values.responsibleUserId = responsibleUserId;
      if (["opportunities", "activities"].includes(payload.entity)) values.owner = responsible.full_name;
      if (payload.entity === "projects") values.manager = responsible.full_name;
    }

    if (payload.entity === "companies") {
      const organizationType = String(values.organizationType ?? "");
      const mappingDate = String(values.mappingDate ?? "");
      const cnpj = String(values.cnpj ?? "").trim();
      if (!["Empresa", "Governo", "Investidor", "Outras"].includes(organizationType)) return Response.json({ error: "Selecione um tipo de organização válido." }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(mappingDate)) return Response.json({ error: "Informe a data de mapeamento da organização." }, { status: 400 });
      if (!isValidCnpj(cnpj)) return Response.json({ error: "Informe um CNPJ brasileiro válido ou deixe o campo vazio." }, { status: 400 });
      values.cnpj = formatCnpj(cnpj);
    }

    if (payload.entity === "contacts") {
      const companyId = Number(values.companyId);
      const { data: company } = await db.from("companies").select("id").eq("id", companyId).maybeSingle();
      if (!company) return Response.json({ error: "Selecione uma organização válida." }, { status: 400 });
      values.companyId = companyId;
    }

    if (payload.entity === "opportunities") {
      const stage = String(values.stage ?? "");
      const sentDate = String(values.sentDate ?? "").trim();
      const acceptedDate = String(values.acceptedDate ?? "").trim();
      const contractDate = String(values.contractDate ?? "").trim();
      if (!["Proposta enviada", "Negociação", "Contratada", "Encerrada"].includes(stage)) return Response.json({ error: "Selecione uma etapa válida para a oportunidade." }, { status: 400 });
      const negotiationDays = elapsedDays(sentDate, acceptedDate);
      const contractingDays = elapsedDays(acceptedDate, contractDate);
      if (sentDate && acceptedDate && negotiationDays < 0) return Response.json({ error: "A data de aceite/recusa não pode ser anterior ao envio." }, { status: 400 });
      if (acceptedDate && contractDate && contractingDays < 0) return Response.json({ error: "A contratação não pode ser anterior ao aceite." }, { status: 400 });
      values.sentDate = sentDate;
      values.acceptedDate = acceptedDate;
      values.contractDate = contractDate;
      values.projectCode = String(values.projectCode ?? "").trim();
      values.negotiationDays = Math.max(0, negotiationDays);
      values.contractingDays = Math.max(0, contractingDays);
      const averageDays = await averageContractingDays();
      values.dueDate = String(values.sourceStatus ?? "") === "Aceito" && acceptedDate && averageDays !== null ? addDays(acceptedDate, averageDays) : "";
    }

    if (payload.entity === "kpis") {
      const label = String(values.label ?? "").trim();
      const unit = String(values.unit ?? "");
      const direction = String(values.direction ?? "");
      const weight = Number(values.weight ?? 0);
      const currentYear = new Date().getUTCFullYear();
      const targets = (Array.isArray(values.targets) ? values.targets : []).map((item) => {
        const row = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return { year: Number(row.year), target: Number(row.target ?? 0), manualActual: Number(row.manualActual ?? 0) };
      }).sort((a, b) => a.year - b.year);
      if (!label) return Response.json({ error: "Informe o nome do indicador." }, { status: 400 });
      if (!["Percentual", "Unidade", "Monetário", "Outro"].includes(unit)) return Response.json({ error: "Selecione uma unidade válida." }, { status: 400 });
      if (!["Quanto maior, melhor", "Quanto menor, melhor"].includes(direction)) return Response.json({ error: "Selecione a direção da meta." }, { status: 400 });
      if (!Number.isInteger(weight) || weight < 1 || weight > 5) return Response.json({ error: "O peso deve ser um inteiro de 1 a 5." }, { status: 400 });
      if (targets.filter((item) => item.year >= currentYear).length < 1 || targets.filter((item) => item.year >= currentYear).length > 5) return Response.json({ error: "Selecione de 1 a 5 anos a partir do ano atual." }, { status: 400 });
      if (new Set(targets.map((item) => item.year)).size !== targets.length || targets.some((item) => !Number.isInteger(item.year) || item.year < 2000 || item.year > currentYear + 9 || !Number.isFinite(item.target) || !Number.isFinite(item.manualActual))) return Response.json({ error: "Revise os anos e valores das metas." }, { status: 400 });
      if (payload.action === "update") {
        const { data: existing } = await db.from("kpis").select("key").eq("id", id).maybeSingle();
        if (existing && systemKpiMethods[existing.key]) values.measurementMethod = systemKpiMethods[existing.key];
      }
      Object.assign(values, { label, weight, showOnDashboard: Boolean(values.showOnDashboard), targets,
        manualActual2026: targets.find((item) => item.year === 2026)?.manualActual ?? 0,
        manualActual2027: targets.find((item) => item.year === 2027)?.manualActual ?? 0,
        manualActual2028: targets.find((item) => item.year === 2028)?.manualActual ?? 0,
        target2026: targets.find((item) => item.year === 2026)?.target ?? 0,
        target2027: targets.find((item) => item.year === 2027)?.target ?? 0,
        target2028: targets.find((item) => item.year === 2028)?.target ?? 0,
      });
      delete values.key;
      if (payload.action === "create") {
        const slug = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "indicador";
        values.key = `custom_${slug}_${Date.now().toString(36)}`;
      }
    }

    const table = entityTables[payload.entity];
    const databaseValues = toDatabase(payload.entity, values);
    if (payload.entity === "opportunities" && payload.action === "update") databaseValues.updated_at = new Date().toISOString();
    let savedId = id;
    if (payload.action === "create") {
      const { data: saved, error } = await db.from(table).insert(databaseValues).select("id").single();
      if (error) throw new Error(error.message);
      savedId = Number(saved.id);
    } else {
      const { error } = await db.from(table).update(databaseValues).eq("id", id);
      if (error) throw new Error(error.message);
    }
    return Response.json({ ...await getSnapshot(), saved: { entity: payload.entity, id: savedId } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao salvar o registro." }, { status: 500 });
  }
}
