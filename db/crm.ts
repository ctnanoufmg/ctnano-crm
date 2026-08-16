import { createAdminClient } from "../lib/supabase/admin";

export type CrmEntity = "users" | "companies" | "contacts" | "opportunities" | "activities" | "projects" | "kpis";

export const entityTables: Record<CrmEntity, string> = {
  users: "crm_users",
  companies: "companies",
  contacts: "contacts",
  opportunities: "opportunities",
  activities: "activities",
  projects: "projects",
  kpis: "kpis",
};

const fieldMaps: Record<CrmEntity, Record<string, string>> = {
  users: { fullName: "full_name", email: "email", phone: "phone", role: "role", active: "active", authUserId: "auth_user_id" },
  companies: { tradeName: "trade_name", legalName: "legal_name", cnpj: "cnpj", organizationType: "organization_type", mappingDate: "mapping_date", size: "size", sector: "sector", uf: "uf", status: "status", responsibleUserId: "responsible_user_id" },
  contacts: { companyId: "company_id", name: "name", email: "email", phone: "phone", role: "role", prospectingDate: "prospecting_date", source: "source", responsibleUserId: "responsible_user_id" },
  opportunities: { companyId: "company_id", sourceCode: "source_code", projectCode: "project_code", title: "title", stage: "stage", sourceStatus: "source_status", lossReason: "loss_reason", origin: "origin", technicalTeam: "technical_team", modality: "modality", totalValue: "total_value", companyValue: "company_value", economicValue: "economic_value", embrapiiValue: "embrapii_value", probability: "probability", owner: "owner", responsibleUserId: "responsible_user_id", uf: "uf", proposalDate: "proposal_date", sentDate: "sent_date", acceptedDate: "accepted_date", contractDate: "contract_date", negotiationDays: "negotiation_days", contractingDays: "contracting_days", nextStep: "next_step", dueDate: "due_date" },
  activities: { opportunityId: "opportunity_id", companyId: "company_id", type: "type", title: "title", dueDate: "due_date", owner: "owner", responsibleUserId: "responsible_user_id", status: "status", notes: "notes" },
  projects: { opportunityId: "opportunity_id", companyId: "company_id", name: "name", status: "status", startDate: "start_date", endDate: "end_date", manager: "manager", responsibleUserId: "responsible_user_id", handoffProgress: "handover_progress", totalValue: "total_value" },
  kpis: { key: "key", label: "label", unit: "unit", direction: "direction", weight: "weight", measurementMethod: "measurement_method", responsibleUserId: "responsible_user_id", showOnDashboard: "show_on_dashboard", targets: "targets", manualActual2026: "manual_actual_2026", manualActual2027: "manual_actual_2027", manualActual2028: "manual_actual_2028", target2026: "target_2026", target2027: "target_2027", target2028: "target_2028" },
};

const dateFields = new Set(["mapping_date", "prospecting_date", "proposal_date", "sent_date", "accepted_date", "contract_date", "due_date", "start_date", "end_date"]);

function base(row: Record<string, unknown>) {
  return { id: Number(row.id), createdAt: String(row.created_at ?? "") };
}

function mapRow(entity: CrmEntity, row: Record<string, unknown>) {
  const result: Record<string, unknown> = base(row);
  for (const [camel, snake] of Object.entries(fieldMaps[entity])) result[camel] = dateFields.has(snake) && row[snake] == null ? "" : row[snake];
  if (entity === "users") {
    result.active = Boolean(row.active);
    result.role = row.role === "admin" ? "admin" : "user";
  }
  if (entity === "projects" && String(result.status).toLowerCase() === "handover") result.status = "Handoff";
  if (entity === "kpis") result.showOnDashboard = Boolean(row.show_on_dashboard);
  return result;
}

export function toDatabase(entity: CrmEntity, values: Record<string, unknown>) {
  const result: Record<string, unknown> = {};
  for (const [camel, snake] of Object.entries(fieldMaps[entity])) {
    if (!Object.prototype.hasOwnProperty.call(values, camel)) continue;
    const value = values[camel];
    result[snake] = dateFields.has(snake)
      ? value == null || typeof value === "string" && !value.trim() ? null : typeof value === "string" ? value.trim() : value
      : value;
  }
  return result;
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return (result.data ?? []) as T;
}

export async function getSnapshot() {
  const db = createAdminClient();
  const results = await Promise.all([
    db.from("crm_users").select("*").order("full_name"),
    db.from("companies").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }),
    db.from("contacts").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }),
    db.from("opportunities").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }),
    db.from("activities").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }),
    db.from("projects").select("*").order("created_at", { ascending: false }).order("id", { ascending: false }),
    db.from("kpis").select("*").order("id"),
    db.from("backups").select("*").order("id", { ascending: false }).limit(10),
  ]);
  const [users, companies, contacts, opportunities, activities, projects, kpis, backups] = results.map((result, index) => unwrap<Record<string, unknown>[]>(result, `Consulta ${index + 1}`));
  const opportunityRows = opportunities.map((row) => mapRow("opportunities", row)) as Array<Record<string, unknown>>;
  const completedContractingDays = opportunityRows
    .filter((item) => item.acceptedDate && item.contractDate)
    .map((item) => Math.floor((Date.parse(`${String(item.contractDate).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(item.acceptedDate).slice(0, 10)}T00:00:00Z`)) / 86400000))
    .filter((days) => Number.isFinite(days) && days >= 0);
  const averageContractingDays = completedContractingDays.length ? Math.round(completedContractingDays.reduce((sum, days) => sum + days, 0) / completedContractingDays.length) : null;

  return {
    users: users.map((row) => mapRow("users", row)),
    companies: companies.map((row) => mapRow("companies", row)),
    contacts: contacts.map((row) => mapRow("contacts", row)),
    opportunities: opportunityRows,
    activities: activities.map((row) => mapRow("activities", row)),
    projects: projects.map((row) => mapRow("projects", row)),
    kpis: kpis.map((row) => mapRow("kpis", row)),
    backups: backups.map((row) => ({ id: Number(row.id), createdAt: String(row.created_at ?? ""), status: String(row.status ?? ""), fileName: String(row.file_name ?? ""), driveFileId: row.drive_file_id ? String(row.drive_file_id) : undefined })),
    insights: { averageContractingDays },
  };
}

// Mantidos por compatibilidade com rotas de importação da versão anterior.
export async function initializeDatabase() {}
export async function seedDatabase() {}
