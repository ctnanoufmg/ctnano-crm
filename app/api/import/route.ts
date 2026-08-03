import { getSnapshot, toDatabase } from "../../../db/crm";
import { requireAdmin, requireCrmApiUser } from "../../../lib/auth";
import { createAdminClient } from "../../../lib/supabase/admin";

type ImportUser = { id?: number; fullName: string; email: string; phone?: string; role?: string; active?: boolean };
type ImportCompany = { tradeName: string; legalName?: string; cnpj?: string; organizationType?: string; mappingDate?: string; size?: string; sector?: string; uf?: string; status?: string; responsibleUserId?: number };
type ImportContact = { companyCnpj?: string; companyName?: string; companyId?: number; name: string; email?: string; phone?: string; role?: string; prospectingDate?: string; source?: string; responsibleUserId?: number };
type ImportOpportunity = { companyCnpj?: string; companyName?: string; companyId?: number; sourceCode?: string; title: string; stage?: string; sourceStatus?: string; lossReason?: string; origin?: string; technicalTeam?: string; modality?: string; totalValue?: number; companyValue?: number; economicValue?: number; embrapiiValue?: number; probability?: number; owner?: string; uf?: string; proposalDate?: string; sentDate?: string; acceptedDate?: string; contractDate?: string; negotiationDays?: number; contractingDays?: number; nextStep?: string; dueDate?: string; responsibleUserId?: number };
type ImportActivity = { companyCnpj?: string; companyName?: string; companyId?: number; opportunityId?: number; opportunitySourceCode?: string; opportunityTitle?: string; type?: string; title: string; dueDate?: string; owner?: string; responsibleUserId?: number; status?: string; notes?: string };
type ImportProject = { companyCnpj?: string; companyName?: string; companyId?: number; opportunityId?: number; opportunitySourceCode?: string; opportunityTitle?: string; name: string; status?: string; startDate?: string; endDate?: string; manager?: string; responsibleUserId?: number; handoverProgress?: number; totalValue?: number };
type ImportKpi = { key: string; label: string; unit?: string; direction?: string; weight?: number; measurementMethod?: string; responsibleUserId?: number; showOnDashboard?: boolean; targets?: unknown[]; manualActual2026?: number; manualActual2027?: number; manualActual2028?: number; target2026?: number; target2027?: number; target2028?: number };
type ImportPayload = { users?: ImportUser[]; companies?: ImportCompany[]; contacts?: ImportContact[]; opportunities?: ImportOpportunity[]; activities?: ImportActivity[]; projects?: ImportProject[]; kpis?: ImportKpi[] };

const normalize = (value?: string) => (value ?? "").trim().toLocaleLowerCase("pt-BR");
const normalizeCnpj = (value?: string) => (value ?? "").replace(/\D/g, "");
const elapsedDays = (start?: string, end?: string) => {
  if (!start || !end) return 0;
  const startTime = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  const endTime = Date.parse(`${end.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(startTime) && Number.isFinite(endTime) && endTime >= startTime ? Math.floor((endTime - startTime) / 86400000) : 0;
};

export async function POST(request: Request) {
  const auth = await requireCrmApiUser();
  if (auth.response || !auth.user) return auth.response;
  if (!requireAdmin(auth.user)) return Response.json({ error: "Somente administradores podem importar dados." }, { status: 403 });
  try {
    const raw = await request.json() as { data?: ImportPayload } & ImportPayload;
    const payload = raw.data ?? raw;
    if (!Array.isArray(payload.companies)) return Response.json({ error: "O arquivo deve conter a lista companies." }, { status: 400 });
    const db = createAdminClient();
    const stats = { users: 0, companies: 0, contacts: 0, opportunities: 0, activities: 0, projects: 0, kpis: 0, skipped: 0, unmatched: 0 };

    const { data: existingUsers, error: usersError } = await db.from("crm_users").select("*");
    if (usersError) throw new Error(usersError.message);
    const users = existingUsers ?? [];
    const sourceUserEmail = new Map((payload.users ?? []).filter((item) => item.id).map((item) => [Number(item.id), normalize(item.email)]));
    for (const source of payload.users ?? []) {
      const email = normalize(source.email);
      const fullName = source.fullName?.trim();
      if (!fullName || !email.endsWith("@ctnano.org")) { stats.skipped += 1; continue; }
      if (users.some((row) => normalize(row.email) === email)) continue;
      const role = email === "ricardo.neres@ctnano.org" ? "admin" : "user";
      const { data: inserted, error } = await db.from("crm_users").insert({ full_name: fullName, email, phone: source.phone ?? "", role, active: source.active !== false }).select("*").single();
      if (error) throw new Error(error.message);
      users.push(inserted); stats.users += 1;
    }
    const resolveResponsible = (sourceId?: number, legacyName?: string) => {
      const email = sourceId ? sourceUserEmail.get(Number(sourceId)) : "";
      return users.find((row) => email ? normalize(row.email) === email : legacyName ? normalize(row.full_name).startsWith(normalize(legacyName)) || normalize(legacyName).startsWith(normalize(row.full_name).split(" ")[0]) : false)?.id ?? auth.user!.id;
    };

    const { data: existingCompanies, error: companiesError } = await db.from("companies").select("*");
    if (companiesError) throw new Error(companiesError.message);
    const companies = existingCompanies ?? [];
    const sourceCompanyIdMap = new Map<number, number>();
    for (const [index, company] of payload.companies.entries()) {
      const tradeName = company.tradeName?.trim();
      if (!tradeName) { stats.skipped += 1; continue; }
      const existing = companies.find((row) => (normalizeCnpj(company.cnpj) && normalizeCnpj(row.cnpj) === normalizeCnpj(company.cnpj)) || (!normalizeCnpj(company.cnpj) && normalize(row.trade_name) === normalize(tradeName)));
      if (existing) { sourceCompanyIdMap.set(Number((company as ImportCompany & { id?: number }).id ?? index + 1), existing.id); stats.skipped += 1; continue; }
      const values = toDatabase("companies", { tradeName, legalName: company.legalName ?? "", cnpj: company.cnpj ?? "", organizationType: ["Empresa", "Governo", "Investidor", "Outras"].includes(company.organizationType ?? "") ? company.organizationType : "Empresa", mappingDate: company.mappingDate ?? "", size: company.size ?? "Outros", sector: company.sector ?? "", uf: company.uf ?? "", status: company.status ?? "Ativa", responsibleUserId: resolveResponsible(company.responsibleUserId) });
      const { data: inserted, error } = await db.from("companies").insert(values).select("*").single();
      if (error) throw new Error(error.message);
      companies.push(inserted); sourceCompanyIdMap.set(Number((company as ImportCompany & { id?: number }).id ?? index + 1), inserted.id); stats.companies += 1;
    }
    const resolveCompany = (sourceId?: number, cnpj?: string, name?: string) => sourceCompanyIdMap.get(Number(sourceId)) ?? companies.find((row) => (normalizeCnpj(cnpj) && normalizeCnpj(row.cnpj) === normalizeCnpj(cnpj)) || (normalize(name) && normalize(row.trade_name) === normalize(name)))?.id;

    const { data: existingContacts } = await db.from("contacts").select("*");
    const contactKeys = new Set((existingContacts ?? []).map((row) => `${row.company_id ?? ""}|${normalize(row.name)}|${normalize(row.email)}`));
    for (const contact of payload.contacts ?? []) {
      const name = contact.name?.trim();
      const companyId = resolveCompany(contact.companyId, contact.companyCnpj, contact.companyName);
      if (!name || !companyId) { stats.unmatched += 1; continue; }
      const key = `${companyId}|${normalize(name)}|${normalize(contact.email)}`;
      if (contactKeys.has(key)) { stats.skipped += 1; continue; }
      const { error } = await db.from("contacts").insert(toDatabase("contacts", { companyId, name, email: contact.email ?? "", phone: contact.phone ?? "", role: contact.role ?? "", prospectingDate: contact.prospectingDate ?? "", source: contact.source ?? "Importação", responsibleUserId: resolveResponsible(contact.responsibleUserId) }));
      if (error) throw new Error(error.message);
      contactKeys.add(key); stats.contacts += 1;
    }

    const { data: existingOpportunities } = await db.from("opportunities").select("*");
    const opportunities = existingOpportunities ?? [];
    const opportunityKeys = new Set(opportunities.map((row) => row.source_code ? `code:${normalize(row.source_code)}` : `title:${row.company_id}|${normalize(row.title)}`));
    const sourceOpportunityMap = new Map<number, number>();
    for (const [index, opportunity] of (payload.opportunities ?? []).entries()) {
      const companyId = resolveCompany(opportunity.companyId, opportunity.companyCnpj, opportunity.companyName);
      const title = opportunity.title?.trim();
      if (!companyId || !title) { stats.unmatched += 1; continue; }
      const key = opportunity.sourceCode ? `code:${normalize(opportunity.sourceCode)}` : `title:${companyId}|${normalize(title)}`;
      const existing = opportunities.find((row) => row.source_code ? `code:${normalize(row.source_code)}` === key : `title:${row.company_id}|${normalize(row.title)}` === key);
      if (existing || opportunityKeys.has(key)) { if (existing) sourceOpportunityMap.set(Number((opportunity as ImportOpportunity & { id?: number }).id ?? index + 1), existing.id); stats.skipped += 1; continue; }
      const values = toDatabase("opportunities", { companyId, sourceCode: opportunity.sourceCode ?? "", title, stage: ["Proposta enviada", "Negociação", "Contratada", "Encerrada"].includes(opportunity.stage ?? "") ? opportunity.stage : "Proposta enviada", sourceStatus: opportunity.sourceStatus ?? "", lossReason: opportunity.lossReason ?? "", origin: opportunity.origin ?? "", technicalTeam: opportunity.technicalTeam ?? "", modality: opportunity.modality ?? "EMBRAPII CG", totalValue: opportunity.totalValue ?? 0, companyValue: opportunity.companyValue ?? 0, economicValue: opportunity.economicValue ?? 0, embrapiiValue: opportunity.embrapiiValue ?? 0, probability: opportunity.probability ?? 10, owner: opportunity.owner ?? "", responsibleUserId: resolveResponsible(opportunity.responsibleUserId, opportunity.owner), uf: opportunity.uf ?? "", proposalDate: opportunity.proposalDate ?? "", sentDate: opportunity.sentDate ?? "", acceptedDate: opportunity.acceptedDate ?? "", contractDate: opportunity.contractDate ?? "", negotiationDays: opportunity.negotiationDays ?? elapsedDays(opportunity.sentDate, opportunity.acceptedDate), contractingDays: opportunity.contractingDays ?? elapsedDays(opportunity.acceptedDate, opportunity.contractDate), nextStep: opportunity.nextStep ?? "", dueDate: opportunity.dueDate ?? "" });
      const { data: inserted, error } = await db.from("opportunities").insert(values).select("*").single();
      if (error) throw new Error(error.message);
      opportunities.push(inserted); opportunityKeys.add(key); sourceOpportunityMap.set(Number((opportunity as ImportOpportunity & { id?: number }).id ?? index + 1), inserted.id); stats.opportunities += 1;
    }
    const resolveOpportunity = (sourceId?: number, code?: string, title?: string) => sourceOpportunityMap.get(Number(sourceId)) ?? opportunities.find((row) => (code && normalize(row.source_code) === normalize(code)) || (title && normalize(row.title) === normalize(title)))?.id ?? null;

    for (const activity of payload.activities ?? []) {
      const companyId = resolveCompany(activity.companyId, activity.companyCnpj, activity.companyName);
      if (!activity.title?.trim()) { stats.skipped += 1; continue; }
      const { error } = await db.from("activities").insert(toDatabase("activities", { companyId: companyId ?? null, opportunityId: resolveOpportunity(activity.opportunityId, activity.opportunitySourceCode, activity.opportunityTitle), type: activity.type ?? "Nota", title: activity.title.trim(), dueDate: activity.dueDate ?? "", owner: activity.owner ?? "", responsibleUserId: resolveResponsible(activity.responsibleUserId, activity.owner), status: activity.status ?? "Concluída", notes: activity.notes ?? "" }));
      if (error) throw new Error(error.message);
      stats.activities += 1;
    }

    for (const project of payload.projects ?? []) {
      const companyId = resolveCompany(project.companyId, project.companyCnpj, project.companyName);
      if (!companyId || !project.name?.trim()) { stats.unmatched += 1; continue; }
      const { error } = await db.from("projects").insert(toDatabase("projects", { companyId, opportunityId: resolveOpportunity(project.opportunityId, project.opportunitySourceCode, project.opportunityTitle), name: project.name.trim(), status: project.status ?? "Em execução", startDate: project.startDate ?? "", endDate: project.endDate ?? "", manager: project.manager ?? "", responsibleUserId: resolveResponsible(project.responsibleUserId, project.manager), handoverProgress: project.handoverProgress ?? 100, totalValue: project.totalValue ?? 0 }));
      if (error) throw new Error(error.message);
      stats.projects += 1;
    }

    for (const kpi of payload.kpis ?? []) {
      if (!kpi.key || !kpi.label) continue;
      const { data: existing } = await db.from("kpis").select("id").eq("key", kpi.key).maybeSingle();
      const values = toDatabase("kpis", { ...kpi, responsibleUserId: resolveResponsible(kpi.responsibleUserId) });
      const { error } = existing ? await db.from("kpis").update(values).eq("id", existing.id) : await db.from("kpis").insert(values);
      if (error) throw new Error(error.message);
      stats.kpis += 1;
    }

    const imported = stats.users + stats.companies + stats.contacts + stats.opportunities + stats.activities + stats.projects + stats.kpis;
    return Response.json({ message: `${imported} registros importados. ${stats.skipped} duplicidades ignoradas e ${stats.unmatched} vínculos não encontrados.`, stats, snapshot: await getSnapshot() });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erro ao importar os dados." }, { status: 500 });
  }
}
