"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../lib/supabase/client";
import { createConfigurableReportExcel, type ReportExcelSection } from "../lib/excel-export";

type Page = "dashboard" | "empresas" | "contatos" | "oportunidades" | "atividades" | "projetos" | "indicadores" | "relatorios" | "configuracoes";
type Entity = "users" | "companies" | "contacts" | "opportunities" | "activities" | "projects" | "kpis";

type CRMUser = { id: number; fullName: string; email: string; phone: string; role: "admin" | "user"; active: boolean; createdAt?: string };
type Company = { id: number; tradeName: string; legalName: string; cnpj: string; organizationType: string; mappingDate: string; size: string; sector: string; uf: string; status: string; responsibleUserId?: number | null; createdAt?: string };
type Contact = { id: number; companyId: number | null; name: string; email: string; phone: string; role: string; prospectingDate: string; source: string; responsibleUserId?: number | null; createdAt?: string };
type Opportunity = { id: number; companyId: number; sourceCode?: string; projectCode?: string; title: string; stage: string; sourceStatus?: string; lossReason?: string; origin?: string; technicalTeam?: string; modality: string; totalValue: number; companyValue: number; economicValue?: number; embrapiiValue?: number; probability: number; owner: string; responsibleUserId?: number | null; uf?: string; proposalDate: string; sentDate: string; acceptedDate?: string; contractDate: string; negotiationDays?: number; contractingDays?: number; nextStep: string; dueDate: string; createdAt?: string };
type Activity = { id: number; opportunityId: number | null; companyId: number | null; type: string; title: string; dueDate: string; owner: string; responsibleUserId?: number | null; status: string; notes: string };
type Project = { id: number; opportunityId: number | null; companyId: number; name: string; status: string; startDate: string; endDate: string; manager: string; responsibleUserId?: number | null; handoverProgress: number; totalValue: number };
type KpiAnnualTarget = { year: number; target: number; manualActual: number };
type KPI = { id: number; key: string; label: string; unit: string; direction: string; weight: number; measurementMethod: string; responsibleUserId?: number | null; showOnDashboard?: boolean; targets?: KpiAnnualTarget[]; manualActual2026: number; manualActual2027: number; manualActual2028: number; target2026: number; target2027: number; target2028: number };
type Backup = { id: number; createdAt: string; status: string; fileName: string; driveFileId?: string };
type Snapshot = { users: CRMUser[]; companies: Company[]; contacts: Contact[]; opportunities: Opportunity[]; activities: Activity[]; projects: Project[]; kpis: KPI[]; backups: Backup[]; insights: { averageContractingDays: number | null } };

const nav: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "Visão geral", icon: "◫" },
  { id: "empresas", label: "Organizações", icon: "▦" },
  { id: "contatos", label: "Contatos", icon: "◎" },
  { id: "oportunidades", label: "Oportunidades", icon: "◇" },
  { id: "atividades", label: "Atividades", icon: "✓" },
  { id: "projetos", label: "Projetos & handover", icon: "⬡" },
  { id: "indicadores", label: "Indicadores", icon: "↗" },
  { id: "relatorios", label: "Relatórios", icon: "▤" },
  { id: "configuracoes", label: "Configurações", icon: "⚙" },
];

const pageEntity: Partial<Record<Page, Entity>> = {
  empresas: "companies",
  contatos: "contacts",
  oportunidades: "opportunities",
  atividades: "activities",
  projetos: "projects",
};

const newRecordLabel: Record<Entity, string> = {
  users: "Novo usuário",
  companies: "Nova organização",
  contacts: "Novo contato",
  opportunities: "Nova oportunidade",
  activities: "Nova atividade",
  projects: "Novo projeto",
  kpis: "Novo indicador",
};

type Metrics = {
  mapped: number; prospected: number; proposals: number; advancedNegotiations: number; contracted: number; contractingCompanies: number; mpeStartup: number;
  pipeline: number; weighted: number; totalNegotiated: number; totalContracted: number; inNegotiation: number;
  companyParticipation: number; successRate: number; decisions: number; annualYear?: number;
  timeline: { label: string; prospects: number; proposals: number; contracts: number }[];
  periodOpportunities: Opportunity[]; periodActivities: Activity[];
};

type PeriodPreset = "currentYear" | "currentMonth" | "last7Days" | "custom" | "year";
type DateRange = { start: string; end: string };

const stages = ["Proposta enviada", "Negociação", "Contratada", "Encerrada"];
const systemKpiMethods: Record<string, string> = {
  prospected_companies: "Contatos prospectados no ano",
  technical_proposals: "Propostas técnicas enviadas no ano",
  contracted_projects: "Projetos contratados no ano",
  contracting_companies: "Empresas contratantes únicas no ano",
  mpe_startup: "Startups/MPEs contratantes no ano",
  average_negotiation_time: "Tempo médio de negociação concluída no ano",
  average_contracting_time: "Tempo médio de contratação concluída no ano",
};
const measurementMethods = ["Apuração manual", "Organizações do tipo Empresa cadastradas no ano", ...Array.from(new Set(Object.values(systemKpiMethods)))];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("pt-BR");
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const date = (value?: string) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : "—";
const closedStages = new Set(["Contratada", "Encerrada"]);

const isoDate = (value: Date) => `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
const localToday = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const parseDate = (value: string) => new Date(`${value}T00:00:00Z`);
const addDays = (value: string, days: number) => { const result = parseDate(value); result.setUTCDate(result.getUTCDate() + days); return isoDate(result); };
const inRange = (value: string | undefined, range: DateRange) => Boolean(value && value.slice(0, 10) >= range.start && value.slice(0, 10) <= range.end);
const formatRange = (range: DateRange) => `${date(range.start)} — ${date(range.end)}`;
const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const onlyDigits = (value: string) => value.replace(/\D/g, "");
const newestFirst = <T extends { id: number; createdAt?: string }>(a: T, b: T) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id - a.id;
const elapsedDays = (start?: string, end?: string) => {
  if (!start || !end) return null;
  const startTime = Date.parse(`${start.slice(0, 10)}T00:00:00Z`);
  const endTime = Date.parse(`${end.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(startTime) && Number.isFinite(endTime) && endTime >= startTime ? Math.floor((endTime - startTime) / 86400000) : null;
};
const durationLabel = (days: number | null) => days === null ? "—" : `${number.format(days)} ${days === 1 ? "dia" : "dias"}`;
const currentYear = () => Number(localToday().slice(0, 4));
const legacyTargets = (kpi: KPI): KpiAnnualTarget[] => [
  { year: 2026, target: Number(kpi.target2026) || 0, manualActual: Number(kpi.manualActual2026) || 0 },
  { year: 2027, target: Number(kpi.target2027) || 0, manualActual: Number(kpi.manualActual2027) || 0 },
  { year: 2028, target: Number(kpi.target2028) || 0, manualActual: Number(kpi.manualActual2028) || 0 },
];
const annualTargets = (kpi: KPI) => Array.isArray(kpi.targets) && kpi.targets.length ? kpi.targets : legacyTargets(kpi);
const annualTarget = (kpi: KPI, year: number) => annualTargets(kpi).find((item) => item.year === year);
const defaultDashboardKeys = new Set(["prospected_companies", "technical_proposals", "contracted_projects", "contracting_companies"]);
const isShownOnDashboard = (kpi: KPI) => kpi.showOnDashboard ?? defaultDashboardKeys.has(kpi.key);
const isValidCnpj = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (!digits) return true;
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const digit = (base: string, weights: number[]) => { const sum = base.split("").reduce((total, item, index) => total + Number(item) * weights[index], 0); const remainder = sum % 11; return remainder < 2 ? 0 : 11 - remainder; };
  const first = digit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(digits.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits.endsWith(`${first}${second}`);
};

function annualCycleTimes(opportunities: Opportunity[]) {
  const today = localToday();
  const currentYear = Number(today.slice(0, 4));
  const completedDates = opportunities.flatMap((item) => [item.acceptedDate ?? "", item.contractDate]).filter((value) => value && value.slice(0, 10) <= today);
  const years = Array.from(new Set([currentYear, ...completedDates.map((value) => Number(value.slice(0, 4))).filter((year) => year >= 2000 && year <= currentYear)])).sort((a, b) => a - b);
  return years.map((year) => {
    const negotiations = opportunities.map((item) => ({ finalDate: item.acceptedDate ?? "", days: elapsedDays(item.sentDate, item.acceptedDate) })).filter((item): item is { finalDate: string; days: number } => item.finalDate.slice(0, 4) === String(year) && item.finalDate.slice(0, 10) <= today && item.days !== null);
    const contracts = opportunities.map((item) => ({ finalDate: item.contractDate, days: elapsedDays(item.acceptedDate, item.contractDate) })).filter((item): item is { finalDate: string; days: number } => item.finalDate.slice(0, 4) === String(year) && item.finalDate.slice(0, 10) <= today && item.days !== null);
    return {
      year,
      negotiation: negotiations.length ? Math.round(negotiations.reduce((sum, item) => sum + item.days, 0) / negotiations.length) : null,
      contracting: contracts.length ? Math.round(contracts.reduce((sum, item) => sum + item.days, 0) / contracts.length) : null,
      negotiationCount: negotiations.length,
      contractingCount: contracts.length,
    };
  });
}

function annualProgress(year: number) {
  const today = parseDate(localToday());
  const currentYear = today.getUTCFullYear();
  const daysInYear = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  if (year < currentYear) return { elapsedDays: daysInYear, daysInYear, ratio: 1 };
  if (year > currentYear) return { elapsedDays: 0, daysInYear, ratio: 0 };
  const elapsedDays = Math.floor((today.getTime() - Date.UTC(year, 0, 1)) / 86400000) + 1;
  return { elapsedDays, daysInYear, ratio: elapsedDays / daysInYear };
}

function kpiAttainment(current: number, goal: number, direction: string) {
  if (direction === "Quanto menor, melhor") {
    if (current <= goal) return 100;
    return current ? goal / current * 100 : 100;
  }
  return goal ? current / goal * 100 : 0;
}

function formatKpiValue(value: number, unit: string) {
  if (unit === "Monetário") return money.format(value);
  if (unit === "Percentual") return `${number.format(value)}%`;
  return number.format(value);
}

function kpiActual(kpi: KPI, data: Snapshot, metrics: Metrics, year: number) {
  switch (kpi.measurementMethod) {
    case "Organizações do tipo Empresa cadastradas no ano":
      return data.companies.filter((company) => company.organizationType === "Empresa" && company.mappingDate?.slice(0, 4) === String(year)).length;
    case "Contatos prospectados no ano": return metrics.prospected;
    case "Propostas técnicas enviadas no ano": return metrics.proposals;
    case "Projetos contratados no ano": return metrics.contracted;
    case "Empresas contratantes únicas no ano": return metrics.contractingCompanies;
    case "Startups/MPEs contratantes no ano": return metrics.mpeStartup;
    case "Tempo médio de negociação concluída no ano": return annualCycleTimes(data.opportunities).find((item) => item.year === year)?.negotiation ?? 0;
    case "Tempo médio de contratação concluída no ano": return annualCycleTimes(data.opportunities).find((item) => item.year === year)?.contracting ?? 0;
    default: return annualTarget(kpi, year)?.manualActual ?? 0;
  }
}

function rangeForYear(year: number): DateRange {
  const currentYear = Number(localToday().slice(0, 4));
  return { start: `${year}-01-01`, end: year === currentYear ? localToday() : `${year}-12-31` };
}

function rangeForPreset(preset: Exclude<PeriodPreset, "custom" | "year">): DateRange {
  const today = localToday();
  const parsed = parseDate(today);
  if (preset === "last7Days") return { start: addDays(today, -6), end: today };
  if (preset === "currentMonth") return { start: `${today.slice(0, 7)}-01`, end: today };
  return rangeForYear(parsed.getUTCFullYear());
}

function opportunityReferenceDate(item: Opportunity) {
  if (item.stage === "Contratada") return item.contractDate || item.sentDate || item.proposalDate || item.createdAt;
  if (item.stage === "Encerrada") return item.acceptedDate || item.sentDate || item.proposalDate || item.createdAt;
  return item.sentDate || item.proposalDate || item.createdAt || item.acceptedDate;
}

function buildTimeline(range: DateRange) {
  const start = parseDate(range.start);
  const end = parseDate(range.end);
  const dayCount = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
  if (dayCount <= 31) {
    return Array.from({ length: dayCount }, (_, index) => {
      const value = addDays(range.start, index);
      return { start: value, end: value, label: date(value).slice(0, 5) };
    });
  }
  const buckets: { start: string; end: string; label: string }[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  while (cursor <= end) {
    const monthStart = isoDate(cursor);
    const monthEnd = isoDate(new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)));
    const label = cursor.toLocaleString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "").toUpperCase();
    buckets.push({ start: monthStart < range.start ? range.start : monthStart, end: monthEnd > range.end ? range.end : monthEnd, label });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return buckets;
}

function calculateMetrics(data: Snapshot, range: DateRange): Metrics {
  const mappedCompanies = data.companies.filter((item) => item.organizationType === "Empresa" && inRange(item.mappingDate || item.createdAt, range));
  const prospectedContacts = data.contacts.filter((item) => inRange(item.prospectingDate || item.createdAt, range));
  const proposals = data.opportunities.filter((item) => inRange(item.sentDate, range));
  const advancedNegotiations = proposals.filter((item) => item.stage === "Negociação");
  const contracts = data.opportunities.filter((item) => item.stage === "Contratada" && inRange(item.contractDate, range));
  const periodOpportunities = data.opportunities.filter((item) => inRange(opportunityReferenceDate(item), range));
  const periodActivities = data.activities.filter((item) => inRange(item.dueDate, range));
  const openPipeline = periodOpportunities.filter((item) => !closedStages.has(item.stage));
  const buckets = buildTimeline(range);
  const timeline = buckets.map((bucket) => {
    const bucketRange = { start: bucket.start, end: bucket.end };
    return {
      label: bucket.label,
      prospects: data.contacts.filter((item) => inRange(item.prospectingDate || item.createdAt, bucketRange)).length,
      proposals: proposals.filter((item) => inRange(item.sentDate, bucketRange)).length,
      contracts: contracts.filter((item) => inRange(item.contractDate, bucketRange)).length,
    };
  });
  const startYear = Number(range.start.slice(0, 4));
  const isAnnual = range.start === `${startYear}-01-01` && (range.end === `${startYear}-12-31` || (startYear === Number(localToday().slice(0, 4)) && range.end === localToday()));
  const totalContracted = contracts.reduce((sum, item) => sum + item.totalValue, 0);
  let companyParticipation = totalContracted ? contracts.reduce((sum, item) => sum + item.companyValue, 0) / totalContracted : 0;
  let successRate = proposals.length ? contracts.length / proposals.length : 0;
  if (isAnnual) {
    const monthBuckets = buckets;
    const months = monthBuckets.length || 1;
    companyParticipation = monthBuckets.reduce((sum, bucket) => {
      const bucketRange = { start: bucket.start, end: bucket.end };
      const rows = contracts.filter((item) => inRange(item.contractDate, bucketRange));
      const total = rows.reduce((value, item) => value + item.totalValue, 0);
      return sum + (total ? rows.reduce((value, item) => value + item.companyValue, 0) / total : 0);
    }, 0) / months;
    successRate = monthBuckets.reduce((sum, bucket) => {
      const bucketRange = { start: bucket.start, end: bucket.end };
      const proposalCount = proposals.filter((item) => inRange(item.sentDate, bucketRange)).length;
      const contractCount = contracts.filter((item) => inRange(item.contractDate, bucketRange)).length;
      return sum + (proposalCount ? contractCount / proposalCount : 0);
    }, 0) / months;
  }
  return {
    mapped: mappedCompanies.length,
    prospected: prospectedContacts.length,
    proposals: proposals.length,
    advancedNegotiations: advancedNegotiations.length,
    contracted: contracts.length,
    contractingCompanies: new Set(contracts.map((item) => item.companyId)).size,
    mpeStartup: new Set(contracts.filter((item) => ["mpe", "startup"].includes((data.companies.find((company) => company.id === item.companyId)?.size ?? "").toLowerCase())).map((item) => item.companyId)).size,
    pipeline: openPipeline.reduce((sum, item) => sum + item.totalValue, 0),
    weighted: openPipeline.reduce((sum, item) => sum + item.totalValue * item.probability / 100, 0),
    totalNegotiated: proposals.reduce((sum, item) => sum + item.totalValue, 0),
    totalContracted,
    inNegotiation: advancedNegotiations.reduce((sum, item) => sum + item.totalValue, 0),
    companyParticipation,
    successRate,
    decisions: data.opportunities.filter((item) => inRange(item.acceptedDate, range)).length,
    annualYear: isAnnual ? startYear : undefined,
    timeline,
    periodOpportunities,
    periodActivities,
  };
}

const fallback: Snapshot = {
  users: [{ id: 1, fullName: "Ricardo Neres", email: "ricardo.neres@ctnano.org", phone: "", role: "admin", active: true }],
  companies: [
    { id: 1, tradeName: "Aperam", legalName: "Aperam Inox América do Sul S.A.", cnpj: "33.390.170/0001-89", organizationType: "Empresa", mappingDate: "2026-01-15", size: "Grande", sector: "Siderurgia", uf: "MG", status: "Ativa", createdAt: "2026-01-15" },
    { id: 2, tradeName: "Nanum", legalName: "Nanum Nanotecnologia S.A.", cnpj: "12.550.305/0001-10", organizationType: "Empresa", mappingDate: "2026-02-12", size: "Startup", sector: "Nanotecnologia", uf: "MG", status: "Ativa", createdAt: "2026-02-12" },
    { id: 3, tradeName: "MedTech Minas", legalName: "MedTech Minas Ltda.", cnpj: "41.203.550/0001-02", organizationType: "Empresa", mappingDate: "2026-03-08", size: "MPE", sector: "Dispositivos médicos", uf: "MG", status: "Ativa", createdAt: "2026-03-08" },
    { id: 4, tradeName: "EcoMateriais", legalName: "EcoMateriais Brasil S.A.", cnpj: "18.301.242/0001-55", organizationType: "Empresa", mappingDate: "2026-04-10", size: "Média", sector: "Construção", uf: "SP", status: "Ativa", createdAt: "2026-04-10" },
  ],
  contacts: [
    { id: 1, companyId: 1, name: "Mariana Alves", email: "mariana.alves@empresa.com", phone: "+55 31 99999-1001", role: "Gerente de P&D", prospectingDate: "2026-07-21", source: "Evento" },
    { id: 2, companyId: 2, name: "Paulo Mendes", email: "paulo@nanum.com.br", phone: "+55 31 98888-2202", role: "Diretor", prospectingDate: "2026-07-15", source: "Indicação" },
    { id: 3, companyId: 3, name: "Fernanda Lima", email: "fernanda@medtech.com.br", phone: "+55 31 97777-3303", role: "CEO", prospectingDate: "2026-06-28", source: "Prospecção ativa" },
  ],
  opportunities: [
    { id: 1, companyId: 1, title: "Revestimento nanoestruturado", stage: "Negociação", modality: "EMBRAPII CG", totalValue: 850000, companyValue: 300000, probability: 75, owner: "Ricardo", proposalDate: "2026-06-18", sentDate: "2026-06-26", contractDate: "", nextStep: "Validar contrapartida econômica", dueDate: "2026-08-08" },
    { id: 2, companyId: 2, title: "Nanocompósito antimicrobiano", stage: "Proposta enviada", modality: "SEBRAE DT", totalValue: 300000, companyValue: 45000, probability: 60, owner: "Diana", proposalDate: "2026-07-02", sentDate: "2026-07-11", contractDate: "", nextStep: "Apresentar escopo à empresa", dueDate: "2026-08-05" },
    { id: 3, companyId: 3, title: "Sensor vestível", stage: "Proposta enviada", modality: "EMBRAPII CG", totalValue: 420000, companyValue: 150000, probability: 40, owner: "Ricardo", proposalDate: "2026-07-28", sentDate: "2026-07-30", contractDate: "", nextStep: "Reunião com equipe técnica", dueDate: "2026-08-12" },
    { id: 4, companyId: 4, title: "Aditivo cimentício avançado", stage: "Contratada", modality: "EMBRAPII CG", totalValue: 680000, companyValue: 245000, probability: 100, owner: "Diana", proposalDate: "2026-03-12", sentDate: "2026-03-20", acceptedDate: "2026-04-10", contractDate: "2026-05-28", negotiationDays: 21, contractingDays: 48, nextStep: "Handover concluído", dueDate: "2026-06-03" },
  ],
  activities: [
    { id: 1, opportunityId: 1, companyId: 1, type: "Follow-up", title: "Confirmar análise jurídica", dueDate: "2026-08-04", owner: "Ricardo", status: "Pendente", notes: "Aguardar retorno do jurídico da empresa." },
    { id: 2, opportunityId: 2, companyId: 2, type: "Reunião", title: "Apresentação da proposta", dueDate: "2026-08-05", owner: "Diana", status: "Pendente", notes: "Participação da coordenação técnica." },
    { id: 3, opportunityId: 3, companyId: 3, type: "Tarefa", title: "Designar pesquisador responsável", dueDate: "2026-08-07", owner: "Ricardo", status: "Pendente", notes: "Alinhar competências necessárias." },
  ],
  projects: [
    { id: 1, opportunityId: 4, companyId: 4, name: "Aditivo cimentício avançado", status: "Em execução", startDate: "2026-06-10", endDate: "2027-06-09", manager: "Marina", handoverProgress: 100, totalValue: 680000 },
    { id: 2, opportunityId: null, companyId: 1, name: "Grafeno para proteção superficial", status: "Handover", startDate: "2026-08-20", endDate: "2027-08-19", manager: "PMO CTNano", handoverProgress: 72, totalValue: 920000 },
  ],
  kpis: [
    { id: 1, key: "prospected_companies", label: "Empresas prospectadas", unit: "Unidade", direction: "Quanto maior, melhor", weight: 3, measurementMethod: "Contatos prospectados no ano", manualActual2026: 0, manualActual2027: 0, manualActual2028: 0, target2026: 84, target2027: 98, target2028: 112 },
    { id: 2, key: "technical_proposals", label: "Propostas técnicas", unit: "Unidade", direction: "Quanto maior, melhor", weight: 3, measurementMethod: "Propostas técnicas enviadas no ano", manualActual2026: 0, manualActual2027: 0, manualActual2028: 0, target2026: 18, target2027: 19, target2028: 20 },
    { id: 3, key: "contracted_projects", label: "Projetos contratados", unit: "Unidade", direction: "Quanto maior, melhor", weight: 3, measurementMethod: "Projetos contratados no ano", manualActual2026: 0, manualActual2027: 0, manualActual2028: 0, target2026: 6, target2027: 7, target2028: 8 },
    { id: 4, key: "contracting_companies", label: "Empresas contratantes", unit: "Unidade", direction: "Quanto maior, melhor", weight: 3, measurementMethod: "Empresas contratantes únicas no ano", manualActual2026: 0, manualActual2027: 0, manualActual2028: 0, target2026: 5, target2027: 6, target2028: 7 },
    { id: 5, key: "mpe_startup", label: "Startups/MPEs contratantes", unit: "Unidade", direction: "Quanto maior, melhor", weight: 3, measurementMethod: "Startups/MPEs contratantes no ano", manualActual2026: 0, manualActual2027: 0, manualActual2028: 0, target2026: 2, target2027: 2, target2028: 2 },
    { id: 6, key: "company_events", label: "Eventos com empresas", unit: "Unidade", direction: "Quanto maior, melhor", weight: 3, measurementMethod: "Apuração manual", manualActual2026: 0, manualActual2027: 0, manualActual2028: 0, target2026: 3, target2027: 3, target2028: 3 },
    { id: 7, key: "pi_requests", label: "Pedidos de PI", unit: "Unidade", direction: "Quanto maior, melhor", weight: 3, measurementMethod: "Apuração manual", manualActual2026: 0, manualActual2027: 0, manualActual2028: 0, target2026: 3, target2027: 3, target2028: 4 },
    { id: 8, key: "satisfaction", label: "Satisfação das empresas", unit: "Unidade", direction: "Quanto maior, melhor", weight: 3, measurementMethod: "Apuração manual", manualActual2026: 0, manualActual2027: 0, manualActual2028: 0, target2026: 8, target2027: 8, target2028: 8 },
    { id: 9, key: "average_negotiation_time", label: "Tempo médio de negociação", unit: "Outro", direction: "Quanto menor, melhor", weight: 3, measurementMethod: "Tempo médio de negociação concluída no ano", manualActual2026: 0, manualActual2027: 0, manualActual2028: 0, target2026: 0, target2027: 0, target2028: 0 },
    { id: 10, key: "average_contracting_time", label: "Tempo médio de contratação", unit: "Outro", direction: "Quanto menor, melhor", weight: 3, measurementMethod: "Tempo médio de contratação concluída no ano", manualActual2026: 0, manualActual2027: 0, manualActual2028: 0, target2026: 0, target2027: 0, target2028: 0 },
  ],
  backups: [],
  insights: { averageContractingDays: 48 },
};

const emptySnapshot: Snapshot = {
  users: [], companies: [], contacts: [], opportunities: [], activities: [], projects: [],
  kpis: fallback.kpis, backups: [], insights: { averageContractingDays: null },
};

function companyName(snapshot: Snapshot, id: number | null) {
  return snapshot.companies.find((item) => item.id === id)?.tradeName ?? "—";
}

function responsibleName(snapshot: Snapshot, id?: number | null, fallbackName = "") {
  return snapshot.users.find((item) => item.id === id)?.fullName ?? (fallbackName || "—");
}

function expectedClosingDate(snapshot: Snapshot, sourceStatus: string, acceptedDate: string) {
  return sourceStatus === "Aceito" && acceptedDate && snapshot.insights.averageContractingDays !== null
    ? addDays(acceptedDate, snapshot.insights.averageContractingDays)
    : "";
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="nav-icon" aria-hidden="true">{children}</span>;
}

export default function CRMApp({ currentUser }: { currentUser: { email: string; name: string; isAdmin: boolean } }) {
  const [page, setPage] = useState<Page>("dashboard");
  const [data, setData] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [organizationSearch, setOrganizationSearch] = useState("");
  const [contactSearch, setContactSearch] = useState("");
  const [opportunitySearch, setOpportunitySearch] = useState("");
  const [modal, setModal] = useState<{ entity: Entity; record?: Record<string, unknown> } | null>(null);
  const [activityPrompt, setActivityPrompt] = useState<{ entity: "companies" | "contacts" | "opportunities"; id: number } | null>(null);
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("currentYear");
  const [dashboardRange, setDashboardRange] = useState<DateRange>(() => rangeForPreset("currentYear"));
  const [selectedKpiYear, setSelectedKpiYear] = useState(currentYear());

  useEffect(() => {
    let active = true;
    fetch("/api/crm")
      .then(async (response) => {
        if (response.ok) return response.json();
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? "Não foi possível carregar os dados do CRM.");
      })
      .then((snapshot) => { if (active) setData(snapshot as Snapshot); })
      .catch((error) => {
        if (!active) return;
        setData(emptySnapshot);
        setLoadError(error instanceof Error ? error.message : "Não foi possível carregar os dados do CRM.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadToken]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  async function save(entity: Entity, values: Record<string, unknown>) {
    const creating = !values.id;
    const response = await fetch("/api/crm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: values.id ? "update" : "create", entity, data: values }),
    });
    const result = await response.json() as Snapshot & { error?: string; saved?: { entity: Entity; id: number } };
    if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar o registro.");
    setData(result);
    setModal(null);
    notify("Registro salvo com sucesso.");
    if (creating && result.saved && ["companies", "contacts", "opportunities"].includes(entity)) {
      setActivityPrompt({ entity: entity as "companies" | "contacts" | "opportunities", id: result.saved.id });
    }
  }

  async function deleteKpi(kpi: KPI) {
    const confirmed = window.confirm(`Excluir o indicador “${kpi.label}”?\n\nEsta ação removerá definitivamente as metas e os valores cadastrados para esse indicador.`);
    if (!confirmed) return;
    try {
      const response = await fetch("/api/crm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", entity: "kpis", data: { id: kpi.id } }),
      });
      const result = await response.json() as Snapshot & { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível excluir o indicador.");
      setData(result);
      notify(result.message ?? "Indicador excluído com sucesso.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Não foi possível excluir o indicador.");
    }
  }

  function openSuggestedActivity() {
    if (!activityPrompt) return;
    let draft: Record<string, unknown> = { type: "Follow-up", status: "Pendente", dueDate: "" };
    if (activityPrompt.entity === "companies") {
      const company = data.companies.find((item) => item.id === activityPrompt.id);
      if (company) draft = { ...draft, companyId: company.id, responsibleUserId: company.responsibleUserId ?? null, title: `Acompanhar ${company.tradeName}`, notes: `Atividade criada após o cadastro da organização ${company.tradeName}.` };
    }
    if (activityPrompt.entity === "contacts") {
      const contact = data.contacts.find((item) => item.id === activityPrompt.id);
      if (contact) draft = { ...draft, companyId: contact.companyId, responsibleUserId: contact.responsibleUserId ?? null, title: `Follow-up com ${contact.name}`, notes: `Contato: ${contact.name}${contact.role ? ` · ${contact.role}` : ""}.` };
    }
    if (activityPrompt.entity === "opportunities") {
      const opportunity = data.opportunities.find((item) => item.id === activityPrompt.id);
      if (opportunity) draft = { ...draft, companyId: opportunity.companyId, opportunityId: opportunity.id, responsibleUserId: opportunity.responsibleUserId ?? null, title: opportunity.nextStep || `Acompanhar ${opportunity.title}`, notes: `Oportunidade: ${opportunity.title}.` };
    }
    setActivityPrompt(null);
    setModal({ entity: "activities", record: draft });
  }

  const metrics = useMemo(() => calculateMetrics(data, dashboardRange), [data, dashboardRange]);
  const indicatorMetrics = useMemo(() => calculateMetrics(data, rangeForYear(selectedKpiYear)), [data, selectedKpiYear]);
  const availableYears = useMemo(() => {
    const values = [localToday(), ...data.companies.map((item) => item.mappingDate || item.createdAt || ""), ...data.contacts.map((item) => item.prospectingDate), ...data.opportunities.flatMap((item) => [item.proposalDate, item.sentDate, item.acceptedDate ?? "", item.contractDate, item.createdAt ?? ""]), ...data.activities.map((item) => item.dueDate)];
    return Array.from(new Set(values.map((value) => Number(value?.slice(0, 4))).filter((value) => value >= 2000 && value <= 2100))).sort((a, b) => b - a);
  }, [data]);

  function applyPreset(preset: Exclude<PeriodPreset, "custom" | "year">) {
    setPeriodPreset(preset);
    setDashboardRange(rangeForPreset(preset));
  }

  function selectDashboardYear(year: number) {
    setPeriodPreset(year === Number(localToday().slice(0, 4)) ? "currentYear" : "year");
    setDashboardRange(rangeForYear(year));
  }

  function changeCustomRange(field: keyof DateRange, value: string) {
    setPeriodPreset("custom");
    setDashboardRange((current) => field === "start"
      ? { start: value, end: value > current.end ? value : current.end }
      : { start: value < current.start ? value : current.start, end: value });
  }

  const filteredCompanies = useMemo(() => {
    const text = normalizeSearch(organizationSearch);
    const digits = onlyDigits(organizationSearch);
    return [...data.companies].filter((item) => !text || normalizeSearch(`${item.tradeName} ${item.legalName}`).includes(text) || Boolean(digits && onlyDigits(item.cnpj).includes(digits))).sort((a, b) => (b.mappingDate || b.createdAt || "").localeCompare(a.mappingDate || a.createdAt || "") || b.id - a.id);
  }, [data.companies, organizationSearch]);

  const filteredContacts = useMemo(() => {
    const text = normalizeSearch(contactSearch);
    const digits = onlyDigits(contactSearch);
    return [...data.contacts].filter((item) => {
      const company = data.companies.find((row) => row.id === item.companyId);
      return !text || normalizeSearch(`${item.name} ${item.email} ${item.role} ${company?.tradeName ?? ""} ${company?.legalName ?? ""}`).includes(text) || Boolean(digits && onlyDigits(`${item.phone} ${company?.cnpj ?? ""}`).includes(digits));
    }).sort(newestFirst);
  }, [contactSearch, data.companies, data.contacts]);

  const filteredOpportunities = useMemo(() => {
    const text = normalizeSearch(opportunitySearch);
    const digits = onlyDigits(opportunitySearch);
    return [...data.opportunities].filter((item) => stages.includes(item.stage)).filter((item) => {
      const company = data.companies.find((row) => row.id === item.companyId);
      return !text || normalizeSearch(`${item.title} ${item.sourceCode ?? ""} ${company?.tradeName ?? ""} ${company?.legalName ?? ""}`).includes(text) || Boolean(digits && onlyDigits(company?.cnpj ?? "").includes(digits));
    }).sort(newestFirst);
  }, [data.companies, data.opportunities, opportunitySearch]);

  const title = nav.find((item) => item.id === page)?.label ?? "Visão geral";
  const activeEntity = pageEntity[page];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-logo"><img src="/ctnano-logo.webp" alt="CTNano/UFMG" /></div>
          <span>CRM · Novos Negócios</span>
        </div>
        <nav aria-label="Navegação principal">
          <p className="nav-label">Gestão comercial</p>
          {nav.slice(0, 5).map((item) => (
            <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => { setPage(item.id); setSidebarOpen(false); }}>
              <Icon>{item.icon}</Icon>{item.label}
              {item.id === "atividades" && <span className="badge">{data.activities.filter((a) => a.status === "Pendente").length}</span>}
            </button>
          ))}
          <p className="nav-label second">Execução & gestão</p>
          {nav.slice(5).filter((item) => currentUser.isAdmin || item.id !== "configuracoes").map((item) => (
            <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => { setPage(item.id); setSidebarOpen(false); }}>
              <Icon>{item.icon}</Icon>{item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="avatar">{currentUser.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}</div>
          <div><strong>{currentUser.name}</strong><span>{currentUser.isAdmin ? "Administrador" : "Operador"}</span></div>
          <button className="signout-button" aria-label="Sair" title="Sair" onClick={async () => { await createSupabaseBrowserClient().auth.signOut(); window.location.assign("/login"); }}>↪</button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Abrir menu">☰</button>
          <div>
            <p className="eyebrow">CRM institucional</p>
            <h1>{title}</h1>
          </div>
          <div className="top-actions">
            <button className="ghost-button" onClick={() => notify("Todos os dados estão sincronizados.")}><span className={`sync-dot ${loading ? "loading" : ""}`} /> {loading ? "Sincronizando" : "Sincronizado"}</button>
            {activeEntity && (
              <button className="primary-button" aria-haspopup="dialog" onClick={() => setModal({ entity: activeEntity })}>＋ {newRecordLabel[activeEntity]}</button>
            )}
          </div>
        </header>

        <div className="content">
          {loadError && <div className="data-load-error" role="alert"><div><strong>Os dados não puderam ser carregados.</strong><span>Nenhum registro demonstrativo foi exibido. Tente carregar novamente.</span></div><button className="secondary-button" onClick={() => { setLoading(true); setLoadError(""); setReloadToken((value) => value + 1); }}>Tentar novamente</button></div>}
          {page === "dashboard" && <Dashboard data={data} metrics={metrics} range={dashboardRange} preset={periodPreset} availableYears={availableYears} applyPreset={applyPreset} selectYear={selectDashboardYear} changeRange={changeCustomRange} setCustom={() => setPeriodPreset("custom")} setPage={setPage} />}
          {page === "empresas" && <Companies data={data} rows={filteredCompanies} search={organizationSearch} setSearch={setOrganizationSearch} edit={(record) => setModal({ entity: "companies", record: record as unknown as Record<string, unknown> })} />}
          {page === "contatos" && <Contacts data={data} rows={filteredContacts} search={contactSearch} setSearch={setContactSearch} edit={(record) => setModal({ entity: "contacts", record: record as unknown as Record<string, unknown> })} />}
          {page === "oportunidades" && <Pipeline data={data} rows={filteredOpportunities} search={opportunitySearch} setSearch={setOpportunitySearch} edit={(record) => setModal({ entity: "opportunities", record: record as unknown as Record<string, unknown> })} />}
          {page === "atividades" && <Activities data={data} edit={(record) => setModal({ entity: "activities", record: record as unknown as Record<string, unknown> })} />}
          {page === "projetos" && <Projects data={data} edit={(record) => setModal({ entity: "projects", record: record as unknown as Record<string, unknown> })} />}
          {page === "indicadores" && <Indicators data={data} metrics={indicatorMetrics} year={selectedKpiYear} setYear={setSelectedKpiYear} />}
          {page === "relatorios" && <Reports data={data} availableYears={availableYears} />}
          {page === "configuracoes" && currentUser.isAdmin && <Settings data={data} canManageKpis={currentUser.isAdmin} addKpi={() => setModal({ entity: "kpis" })} editKpi={(record) => setModal({ entity: "kpis", record: record as unknown as Record<string, unknown> })} deleteKpi={deleteKpi} addUser={() => setModal({ entity: "users" })} editUser={(record) => setModal({ entity: "users", record: record as unknown as Record<string, unknown> })} onImport={async (file) => {
            try {
              const payload = JSON.parse(await file.text());
              const response = await fetch("/api/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
              const result = await response.json() as { error?: string; snapshot: Snapshot; message: string };
              if (!response.ok) throw new Error(result.error ?? "Arquivo incompatível.");
              setData(result.snapshot); notify(result.message);
            } catch (error) { notify(error instanceof Error ? error.message : "Não foi possível importar o arquivo."); }
          }} onBackup={async () => {
            const response = await fetch("/api/backup", { method: "POST" });
            const result = await response.json() as { error?: string; snapshot: Snapshot; message: string };
            if (!response.ok) { notify(result.error ?? "Não foi possível criar o backup."); return; }
            setData(result.snapshot); notify(result.message);
          }} />}
        </div>
      </main>
      {modal && <RecordModal modal={modal} snapshot={data} close={() => setModal(null)} save={save} />}
      {activityPrompt && <ActivityPrompt close={() => setActivityPrompt(null)} create={openSuggestedActivity} />}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </div>
  );
}

function Dashboard({ data, metrics, range, preset, availableYears, applyPreset, selectYear, changeRange, setCustom, setPage }: {
  data: Snapshot; metrics: Metrics; range: DateRange; preset: PeriodPreset; availableYears: number[];
  applyPreset: (preset: Exclude<PeriodPreset, "custom" | "year">) => void; selectYear: (year: number) => void;
  changeRange: (field: keyof DateRange, value: string) => void; setCustom: () => void; setPage: (page: Page) => void;
}) {
  const target = (key: string) => {
    const year = metrics.annualYear;
    if (!year) return undefined;
    const kpi = data.kpis.find((item) => item.key === key);
    return kpi ? annualTarget(kpi, year)?.target : undefined;
  };
  const periodTitle = preset === "currentYear" ? "Ano atual" : preset === "currentMonth" ? "Mês atual" : preset === "last7Days" ? "Últimos 7 dias" : preset === "year" ? String(metrics.annualYear ?? "Ano") : "Período personalizado";
  const baseCards = [
    { key: "prospected_companies", label: "Empresas prospectadas", value: metrics.prospected, target: target("prospected_companies"), icon: "▦", detail: "Contatos com data de prospecção" },
    { key: "technical_proposals", label: "Propostas técnicas", value: metrics.proposals, target: target("technical_proposals"), icon: "◇", detail: "Propostas enviadas no período" },
    { key: "contracted_projects", label: "Projetos contratados", value: metrics.contracted, target: target("contracted_projects"), icon: "✓", detail: "Contratações concluídas" },
    { key: "contracting_companies", label: "Empresas contratantes", value: metrics.contractingCompanies, target: target("contracting_companies"), icon: "◎", detail: "CNPJs únicos contratantes" },
  ].filter((card) => { const kpi = data.kpis.find((item) => item.key === card.key); return !kpi || isShownOnDashboard(kpi); });
  const extraKpiCards = metrics.annualYear ? data.kpis.filter((kpi) => isShownOnDashboard(kpi) && !defaultDashboardKeys.has(kpi.key)).map((kpi) => {
    const actual = kpiActual(kpi, data, metrics, metrics.annualYear!);
    return { key: kpi.key, label: kpi.label, value: formatKpiValue(actual, kpi.unit), numericValue: actual, target: annualTarget(kpi, metrics.annualYear!)?.target, icon: "↗", detail: "Indicador anual selecionado" };
  }) : [];
  const cards = [...baseCards, ...extraKpiCards,
    { key: "company_participation", label: "Participação das empresas", value: percent.format(metrics.companyParticipation), target: undefined, icon: "%", detail: metrics.annualYear ? "Média mensal do aporte financeiro" : "Aporte financeiro no período" },
    { key: "success_rate", label: "Taxa de sucesso", value: percent.format(metrics.successRate), target: undefined, icon: "↗", detail: metrics.annualYear ? "Média mensal de contratos por proposta" : "Contratos por proposta no período" },
  ];
  const modalityRows = Array.from(new Set(metrics.periodOpportunities.map((item) => item.modality))).map((modality) => {
    const contracted = metrics.periodOpportunities.filter((item) => item.modality === modality && item.stage === "Contratada").reduce((sum, item) => sum + item.totalValue, 0);
    const open = metrics.periodOpportunities.filter((item) => item.modality === modality && !closedStages.has(item.stage)).reduce((sum, item) => sum + item.totalValue, 0);
    return [modality, money.format(contracted), money.format(open)] as React.ReactNode[];
  }).filter((row) => row[1] !== money.format(0) || row[2] !== money.format(0));
  const selectedYear = metrics.annualYear && availableYears.includes(metrics.annualYear) ? String(metrics.annualYear) : "";
  const cycleTimes = annualCycleTimes(data.opportunities);
  return <>
    <section className="welcome-row">
      <div><h2>Painel</h2><p>Indicadores comerciais consolidados.</p></div>
    </section>
    <section className="dashboard-filter panel" aria-label="Filtro de período do dashboard">
      <div className="quick-periods" role="group" aria-label="Períodos rápidos">
        <button className={preset === "currentYear" ? "active" : ""} aria-pressed={preset === "currentYear"} onClick={() => applyPreset("currentYear")}>Ano atual</button>
        <button className={preset === "currentMonth" ? "active" : ""} aria-pressed={preset === "currentMonth"} onClick={() => applyPreset("currentMonth")}>Mês atual</button>
        <button className={preset === "last7Days" ? "active" : ""} aria-pressed={preset === "last7Days"} onClick={() => applyPreset("last7Days")}>Últimos 7 dias</button>
        <button className={preset === "custom" ? "active" : ""} aria-pressed={preset === "custom"} onClick={setCustom}>Período personalizado</button>
      </div>
      <label className="year-filter"><span>Ano dos registros</span><select value={selectedYear} onChange={(event) => { if (event.target.value) selectYear(Number(event.target.value)); }}><option value="">Selecionar ano</option>{availableYears.map((year) => <option value={year} key={year}>{year}</option>)}</select></label>
      {preset === "custom" && <div className="custom-range"><label><span>Data inicial</span><input type="date" value={range.start} max={range.end} onChange={(event) => changeRange("start", event.target.value)} /></label><span aria-hidden="true">até</span><label><span>Data final</span><input type="date" value={range.end} min={range.start} onChange={(event) => changeRange("end", event.target.value)} /></label></div>}
      <div className="period-summary"><span className="calendar-mark" aria-hidden="true">▣</span><span>Exibindo dados de <strong>{formatRange(range)}</strong></span></div>
    </section>
    <section className="metrics-grid executive">
      {cards.map((card, index) => {
        const numericValue = "numericValue" in card ? Number(card.numericValue) : typeof card.value === "number" ? card.value : 0;
        const pct = card.target ? Math.min(100, numericValue / card.target * 100) : null;
        return <article className="metric-card" key={card.label}>
          <div className="metric-top"><span className={`metric-icon icon-${index % 4}`}>{card.icon}</span><span className="trend">{periodTitle}</span></div>
          <p>{card.label}</p><strong>{card.value}</strong>
          {card.target ? <><div className="progress"><span style={{ width: `${pct}%` }} /></div><small>{numericValue} de {card.target} · {Math.round(pct ?? 0)}%</small></> : <small>{card.detail}</small>}
        </article>;
      })}
    </section>
    <section className="financial-grid">
      <article className="panel finance-card"><small>Total negociado</small><strong>{money.format(metrics.totalNegotiated)}</strong><span>Propostas enviadas no período</span></article>
      <article className="panel finance-card"><small>Total contratado</small><strong>{money.format(metrics.totalContracted)}</strong><span>Projetos contratados no período</span></article>
      <article className="panel finance-card"><small>Em negociação</small><strong>{money.format(metrics.inNegotiation)}</strong><span>Propostas abertas do período</span></article>
      <article className="panel finance-card"><small>Pipeline aberto</small><strong>{money.format(metrics.pipeline)}</strong><span>{money.format(metrics.weighted)} ponderado</span></article>
    </section>
    <section className="dashboard-grid dashboard-main">
      <article className="panel monthly-panel">
        <div className="panel-heading"><div><p className="eyebrow">Evolução no período</p><h3>Prospecções, propostas e contratos</h3></div></div>
        <EvolutionLineChart items={metrics.timeline} />
      </article>
      <article className="panel funnel-panel">
        <div className="panel-heading"><div><p className="eyebrow">Conversão</p><h3>Funil comercial do período</h3></div><button className="text-button" onClick={() => setPage("oportunidades")}>Ver oportunidades →</button></div>
        <CommercialFunnel metrics={metrics} />
      </article>
    </section>
    <section className="panel cycle-time-panel">
      <div className="panel-heading"><div><p className="eyebrow">Eficiência comercial</p><h3>Tempos médios de negociação e contratação</h3></div></div>
      <AnnualCycleTimeChart items={cycleTimes} />
      <p className="cycle-time-note">O tempo de negociação é contabilizado no ano do aceite/recusa. O tempo de contratação é contabilizado no ano da conclusão da contratação. O ano atual considera os encerramentos registrados até hoje.</p>
    </section>
    <section className="dashboard-grid">
      <article className="panel list-panel"><div className="panel-heading padded"><div><p className="eyebrow">Carteiras</p><h3>Contratado e pipeline por modalidade</h3></div></div><DataTable headers={["Modalidade", "Contratado no período", "Pipeline aberto"]} rows={modalityRows} /></article>
      <article className="panel agenda-panel">
        <div className="panel-heading"><div><p className="eyebrow">Prioridades</p><h3>Atividades do período</h3></div><button className="text-button" onClick={() => setPage("atividades")}>Ver todas →</button></div>
        <div className="agenda-list">{metrics.periodActivities.filter((item) => item.status === "Pendente").sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 5).map((activity) => <div className="agenda-item" key={activity.id}><div className="date-box"><strong>{activity.dueDate ? new Date(`${activity.dueDate}T12:00:00`).getDate() : "—"}</strong><span>{activity.dueDate ? new Date(`${activity.dueDate}T12:00:00`).toLocaleString("pt-BR", { month: "short" }).toUpperCase().replace(".", "") : ""}</span></div><div><strong>{activity.title}</strong><span>{companyName(data, activity.companyId)} · {responsibleName(data, activity.responsibleUserId, activity.owner)}</span></div><span className="tag">{activity.type}</span></div>)}{!metrics.periodActivities.some((item) => item.status === "Pendente") && <p className="empty-agenda">Nenhuma atividade pendente no período.</p>}</div>
      </article>
    </section>
    <section className="panel recent-panel">
      <div className="panel-heading"><div><p className="eyebrow">Em andamento</p><h3>Oportunidades prioritárias</h3></div><button className="text-button" onClick={() => setPage("oportunidades")}>Abrir pipeline →</button></div>
      <DataTable headers={["Código", "Oportunidade", "Empresa", "Etapa", "Valor", "Probabilidade", "Próximo passo"]} rows={metrics.periodOpportunities.filter((item) => !closedStages.has(item.stage)).sort((a, b) => b.totalValue - a.totalValue).slice(0, 6).map((item) => [item.sourceCode || "—", item.title, companyName(data, item.companyId), <Status key="s" value={item.stage} />, money.format(item.totalValue), `${item.probability}%`, item.nextStep || "Definir próximo passo"])} />
    </section>
  </>;
}

function EvolutionLineChart({ items }: { items: Metrics["timeline"] }) {
  const width = 820;
  const height = 300;
  const inset = { top: 28, right: 20, bottom: 42, left: 46 };
  const plotWidth = width - inset.left - inset.right;
  const plotHeight = height - inset.top - inset.bottom;
  const maxValue = Math.max(1, ...items.flatMap((item) => [item.prospects, item.proposals, item.contracts]));
  const step = maxValue <= 10 ? 2 : Math.ceil(maxValue / 5);
  const yMax = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, index) => index * step);
  const x = (index: number) => items.length <= 1 ? inset.left + plotWidth / 2 : inset.left + index * plotWidth / (items.length - 1);
  const y = (value: number) => inset.top + plotHeight - value / yMax * plotHeight;
  const smoothPath = (values: number[]) => {
    const points = values.map((value, index) => ({ x: x(index), y: y(value) }));
    if (!points.length) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    return points.slice(1).reduce((path, point, index) => {
      const previous = points[index];
      const middle = (previous.x + point.x) / 2;
      return `${path} C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`;
    }, `M ${points[0].x} ${points[0].y}`);
  };
  const series = [
    { key: "prospects", label: "Prospecções", color: "#2f8ad9", values: items.map((item) => item.prospects) },
    { key: "proposals", label: "Propostas", color: "#fbbf24", values: items.map((item) => item.proposals) },
    { key: "contracts", label: "Contratos", color: "#22c976", values: items.map((item) => item.contracts) },
  ];
  const labelEvery = Math.max(1, Math.ceil(items.length / 12));
  return <div className="evolution-chart" role="img" aria-label="Gráfico de linhas com a evolução de prospecções, propostas e contratos no período">
    <div className="line-chart-legend">{series.map((line) => <span key={line.key}><i style={{ background: line.color }} />{line.label}</span>)}</div>
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {ticks.map((tick) => <g key={tick}><line className="chart-grid-line" x1={inset.left} x2={width - inset.right} y1={y(tick)} y2={y(tick)} /><text className="chart-axis-label y-label" x={inset.left - 12} y={y(tick) + 4}>{tick}</text></g>)}
      {items.map((item, index) => index % labelEvery === 0 || index === items.length - 1 ? <text className="chart-axis-label x-label" key={`${item.label}-${index}`} x={x(index)} y={height - 12}>{item.label}</text> : null)}
      {series.map((line, seriesIndex) => <g key={line.key}>
        <path className="chart-line" d={smoothPath(line.values)} stroke={line.color} />
        {line.values.map((value, index) => <g key={`${line.key}-${index}`}><circle className="chart-point" cx={x(index)} cy={y(value)} r="5" fill={line.color} />{(items.length <= 14 || value > 0) && <text className="chart-value" x={x(index)} y={Math.max(12, y(value) - 10 - seriesIndex * 9)} fill={line.color}>{value}</text>}</g>)}
      </g>)}
    </svg>
  </div>;
}

function AnnualCycleTimeChart({ items }: { items: ReturnType<typeof annualCycleTimes> }) {
  const width = 820;
  const height = 290;
  const inset = { top: 24, right: 20, bottom: 42, left: 50 };
  const plotWidth = width - inset.left - inset.right;
  const plotHeight = height - inset.top - inset.bottom;
  const values = items.flatMap((item) => [item.negotiation ?? 0, item.contracting ?? 0]);
  const maxValue = Math.max(1, ...values);
  const step = Math.max(1, Math.ceil(maxValue / 5));
  const yMax = Math.max(step, Math.ceil(maxValue / step) * step);
  const ticks = Array.from({ length: Math.floor(yMax / step) + 1 }, (_, index) => index * step);
  const groupWidth = plotWidth / Math.max(1, items.length);
  const barWidth = Math.min(42, groupWidth * .28);
  const y = (value: number) => inset.top + plotHeight - value / yMax * plotHeight;
  const colors = { negotiation: "#38bdf8", contracting: "#34d399" };
  return <div className="cycle-time-chart" role="img" aria-label={`Tempos médios anuais em dias: ${items.map((item) => `${item.year}, negociação ${item.negotiation === null ? "sem dados" : Math.round(item.negotiation)}, contratação ${item.contracting === null ? "sem dados" : Math.round(item.contracting)}`).join("; ")}`}>
    <div className="line-chart-legend"><span><i style={{ background: colors.negotiation }} />Tempo médio de negociação</span><span><i style={{ background: colors.contracting }} />Tempo médio de contratação</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {ticks.map((tick) => <g key={tick}><line className="chart-grid-line" x1={inset.left} x2={width - inset.right} y1={y(tick)} y2={y(tick)} /><text className="chart-axis-label y-label" x={inset.left - 12} y={y(tick) + 4}>{tick}</text></g>)}
      <text className="chart-axis-title" x="12" y={inset.top + plotHeight / 2} transform={`rotate(-90 12 ${inset.top + plotHeight / 2})`}>dias</text>
      {items.map((item, index) => {
        const center = inset.left + groupWidth * (index + .5);
        const bars = [{ key: "negotiation", value: item.negotiation, count: item.negotiationCount, x: center - barWidth - 3, color: colors.negotiation }, { key: "contracting", value: item.contracting, count: item.contractingCount, x: center + 3, color: colors.contracting }];
        return <g key={item.year}>
          {bars.map((bar) => <g key={bar.key}><rect className="cycle-bar" x={bar.x} y={y(bar.value ?? 0)} width={barWidth} height={bar.value === null ? 0 : inset.top + plotHeight - y(bar.value)} rx="4" fill={bar.color}><title>{bar.value === null ? "Sem casos concluídos" : `${Math.round(bar.value)} dias · ${bar.count} ${bar.count === 1 ? "caso" : "casos"}`}</title></rect><text className="chart-value" x={bar.x + barWidth / 2} y={bar.value === null ? y(0) - 8 : Math.max(13, y(bar.value) - 8)} fill={bar.color}>{bar.value === null ? "—" : number.format(Math.round(bar.value))}</text></g>)}
          <text className="chart-axis-label x-label" x={center} y={height - 12}>{item.year}{item.year === Number(localToday().slice(0, 4)) ? "*" : ""}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function CommercialFunnel({ metrics }: { metrics: Metrics }) {
  const items = [
    { label: "Empresas mapeadas", value: metrics.mapped, icon: "◎", color: "#ea6a26", width: 100 },
    { label: "Empresas prospectadas", value: metrics.prospected, icon: "▦", color: "#f1c93b", width: 88 },
    { label: "Propostas técnicas", value: metrics.proposals, icon: "▤", color: "#1d67ad", width: 76 },
    { label: "Negociações avançadas", value: metrics.advancedNegotiations, icon: "⇄", color: "#338fc5", width: 64 },
    { label: "Projetos contratados", value: metrics.contracted, icon: "✓", color: "#43b9a2", width: 52 },
  ];
  return <div className="commercial-funnel" role="img" aria-label={`Funil comercial: ${items.map((item) => `${item.label}, ${item.value}`).join("; ")}`}>
    {items.map((item) => <div className="commercial-funnel-row" key={item.label} style={{ "--funnel-color": item.color, "--funnel-width": `${item.width}%` } as React.CSSProperties}>
      <strong>{number.format(item.value)}</strong>
      <div className="commercial-funnel-track"><div className="commercial-funnel-step"><span aria-hidden="true">{item.icon}</span><b>{item.label}</b></div></div>
    </div>)}
  </div>;
}

function Companies({ data, rows, search, setSearch, edit }: { data: Snapshot; rows: Company[]; search: string; setSearch: (value: string) => void; edit: (record: Company) => void }) {
  return <section className="panel list-panel"><div className="list-toolbar"><div className="search-box">⌕<input aria-label="Buscar organizações" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por parte do nome ou CNPJ..." /></div><span className="list-count">{rows.length} organizações</span></div>
    <DataTable headers={["Organização", "CNPJ", "Tipo", "Data de mapeamento", "Porte", "Setor", "UF", "Responsável", "Oportunidades", "Status", ""]} rows={rows.map((c) => [<div className="company-cell" key="c"><span>{c.tradeName.slice(0, 2).toUpperCase()}</span><div><strong>{c.tradeName}</strong><small>{c.legalName}</small></div></div>, c.cnpj, c.organizationType, date(c.mappingDate), c.size, c.sector, c.uf, responsibleName(data, c.responsibleUserId), data.opportunities.filter((o) => o.companyId === c.id).length, <Status key="s" value={c.status} />, <button key="e" className="row-action" onClick={() => edit(c)}>Editar</button>])} />
  </section>;
}

function Contacts({ data, rows, search, setSearch, edit }: { data: Snapshot; rows: Contact[]; search: string; setSearch: (value: string) => void; edit: (record: Contact) => void }) {
  return <section className="panel list-panel"><div className="list-toolbar"><div className="search-box">⌕<input aria-label="Buscar contatos" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar contato, organização ou CNPJ..." /></div><span className="list-count">{rows.length} contatos</span></div><DataTable headers={["Contato", "Organização", "Cadastrado em", "Cargo", "Telefone", "Data da prospecção", "Origem", "Responsável", ""]} rows={rows.map((c) => [<div key="n"><strong>{c.name}</strong><small className="block">{c.email}</small></div>, companyName(data, c.companyId), date(c.createdAt), c.role, c.phone, date(c.prospectingDate), c.source, responsibleName(data, c.responsibleUserId), <button key="e" className="row-action" onClick={() => edit(c)}>Editar</button>])} /></section>;
}

function Pipeline({ data, rows, search, setSearch, edit }: { data: Snapshot; rows: Opportunity[]; search: string; setSearch: (value: string) => void; edit: (record: Opportunity) => void }) {
  return <>
    <div className="panel pipeline-toolbar"><div className="search-box">⌕<input aria-label="Buscar oportunidades" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar oportunidade, organização ou CNPJ..." /></div><span className="list-count">{rows.length} oportunidades</span></div>
    <div className="kanban-wrap"><div className="kanban">{stages.map((stage) => {
      const items = rows.filter((o) => o.stage === stage);
      return <section className="kanban-column" key={stage}>
        <header><span className={`stage-dot stage-${stages.indexOf(stage)}`} /><strong>{stage}</strong><b>{items.length}</b></header>
        <div className="kanban-total">{money.format(items.reduce((sum, o) => sum + o.totalValue, 0))}</div>
        {items.map((o) => <button className="deal-card" key={o.id} onClick={() => edit(o)}>
          <span className="deal-company">{companyName(data, o.companyId)}</span><strong>{o.title}</strong><p>{o.nextStep || "Definir próximo passo"}</p>
          <div><b>{money.format(o.totalValue)}</b><span>{o.probability}%</span></div>
          <div className="deal-times"><span>Negociação <b>{durationLabel(elapsedDays(o.sentDate, o.acceptedDate))}</b></span><span>Contratação <b>{durationLabel(elapsedDays(o.acceptedDate, o.contractDate))}</b></span></div>
          <footer><span>{responsibleName(data, o.responsibleUserId, o.owner).slice(0, 2).toUpperCase()}</span><small>até {date(o.dueDate)}</small></footer>
        </button>)}
      </section>;
    })}</div></div>
  </>;
}

function Activities({ data, edit }: { data: Snapshot; edit: (record: Activity) => void }) {
  const ordered = [...data.activities].sort((a, b) => {
    const statusOrder = Number(b.status === "Pendente") - Number(a.status === "Pendente");
    if (statusOrder) return statusOrder;
    return (a.dueDate || "9999-12-31").localeCompare(b.dueDate || "9999-12-31") || b.id - a.id;
  });
  return <section className="panel list-panel"><div className="summary-strip"><div><span className="dot red" /><strong>{data.activities.filter((a) => a.status === "Pendente").length}</strong><small>Pendentes</small></div><div><span className="dot green" /><strong>{data.activities.filter((a) => a.status === "Concluída").length}</strong><small>Concluídas</small></div></div><DataTable headers={["Atividade", "Empresa", "Tipo", "Prazo", "Responsável", "Status", ""]} rows={ordered.map((a) => [<div key="a"><strong>{a.title}</strong><small className="block">{a.notes}</small></div>, companyName(data, a.companyId), a.type, date(a.dueDate), responsibleName(data, a.responsibleUserId, a.owner), <Status key="s" value={a.status} />, <button key="e" className="row-action" onClick={() => edit(a)}>Editar</button>])} /></section>;
}

function Projects({ data, edit }: { data: Snapshot; edit: (record: Project) => void }) {
  return <div className="project-grid">{data.projects.map((p) => <article className="panel project-card" key={p.id}><div className="project-head"><div><span>{companyName(data, p.companyId)}</span><h3>{p.name}</h3></div><Status value={p.status} /></div><div className="project-meta"><div><small>Valor total</small><strong>{money.format(p.totalValue)}</strong></div><div><small>Responsável</small><strong>{responsibleName(data, p.responsibleUserId, p.manager)}</strong></div><div><small>Período</small><strong>{date(p.startDate)} — {date(p.endDate)}</strong></div></div><div className="handover"><div><span>Checklist de handover</span><strong>{p.handoverProgress}%</strong></div><div className="progress large"><span style={{ width: `${p.handoverProgress}%` }} /></div><p>{p.handoverProgress === 100 ? "Responsabilidades, documentos e escopo transferidos ao PMO." : "Escopo técnico e marcos definidos · pendente validação financeira."}</p></div><button className="secondary-button full" onClick={() => edit(p)}>Abrir projeto</button></article>)}</div>;
}

function Indicators({ data, metrics, year, setYear }: { data: Snapshot; metrics: Metrics; year: number; setYear: (year: number) => void }) {
  const target = (kpi: KPI) => annualTarget(kpi, year)?.target ?? 0;
  const availableKpiYears = Array.from(new Set([...Array.from({ length: 5 }, (_, index) => currentYear() + index), ...data.kpis.flatMap((kpi) => annualTargets(kpi).map((item) => item.year))])).filter((item) => item >= currentYear()).sort((a, b) => a - b);
  const progress = annualProgress(year);
  const kpisWithTarget = data.kpis.filter((kpi) => target(kpi) > 0);
  const totalWeight = kpisWithTarget.reduce((sum, kpi) => sum + (Number(kpi.weight) || 0), 0);
  const weightedScore = totalWeight ? kpisWithTarget.reduce((sum, kpi) => {
    const score = Math.min(100, kpiAttainment(kpiActual(kpi, data, metrics, year), target(kpi), kpi.direction));
    return sum + score * (Number(kpi.weight) || 0);
  }, 0) / totalWeight : 0;
  return <>
    <section className="indicator-header"><div><p className="eyebrow">Ano de referência</p><h2>Metas EMBRAPII {year}</h2></div><label className="period-filter">Ano <select value={year} onChange={(event) => setYear(Number(event.target.value))}>{availableKpiYears.map((availableYear) => <option key={availableYear}>{availableYear}</option>)}</select></label></section>
    <section className="indicator-summary">
      <article className="panel"><small>Avanço do ano</small><strong>{percent.format(progress.ratio)}</strong><span>{progress.elapsedDays} de {progress.daysInYear} dias</span></article>
      <article className="panel"><small>Desempenho ponderado</small><strong>{Math.round(weightedScore)}%</strong><span>Soma dos pesos: {number.format(totalWeight)}</span></article>
      <article className="panel"><small>Cálculo proporcional</small><strong>Realizado ÷ esperado</strong><span>Exclusivo para o ano selecionado</span></article>
    </section>
    <section className="indicator-grid">{data.kpis.map((kpi) => {
      const current = kpiActual(kpi, data, metrics, year);
      const goal = target(kpi);
      const hasTarget = goal > 0;
      const expected = goal * progress.ratio;
      const annualPct = hasTarget ? Math.min(100, kpiAttainment(current, goal, kpi.direction)) : 0;
      const proportionalPct = hasTarget && progress.ratio ? Math.min(999, kpiAttainment(current, expected, kpi.direction)) : null;
      const balance = kpi.direction === "Quanto menor, melhor" ? Math.max(0, current - goal) : Math.max(0, goal - current);
      return <article className="panel indicator-card" key={kpi.id}>
        <div><span>{kpi.label}</span><small>{systemKpiMethods[kpi.key]?.startsWith("Tempo médio") ? "Dias" : kpi.unit} · peso {number.format(kpi.weight)}</small></div>
        <strong>{formatKpiValue(current, kpi.unit)} <small>{hasTarget ? `/ ${formatKpiValue(goal, kpi.unit)}` : "· meta não definida"}</small></strong>
        <div className="progress large"><span style={{ width: `${annualPct}%` }} /></div>
        <footer><span>{hasTarget ? `${Math.round(annualPct)}% da meta anual` : "Indicador de acompanhamento"}</span><span>{hasTarget ? `${formatKpiValue(balance, kpi.unit)} ${kpi.direction === "Quanto menor, melhor" ? "acima do limite" : "restantes"}` : "Defina uma meta anual"}</span></footer>
        <div className="proportional-result"><span>Esperado até a data</span><strong>{hasTarget ? formatKpiValue(expected, kpi.unit) : "—"}</strong><span>Atendimento proporcional</span><strong>{proportionalPct === null ? "—" : `${Math.round(proportionalPct)}%`}</strong></div>
      </article>;
    })}</section>
    <p className="indicator-note">O atendimento proporcional compara o realizado com a fração da meta correspondente aos dias transcorridos no ano selecionado. Fontes automáticas usam os registros do CRM; na apuração manual, o valor realizado é informado pelo administrador para cada ano.</p>
    <section className="panel list-panel"><div className="panel-heading padded"><div><p className="eyebrow">Planejamento</p><h3>Metas plurianuais</h3></div></div><DataTable headers={["Indicador", "Unidade", "Direção", "Peso", "Metas por ano"]} rows={data.kpis.map((k) => [k.label, k.unit, k.direction, number.format(k.weight), annualTargets(k).filter((item) => item.year >= currentYear()).sort((a, b) => a.year - b.year).map((item) => `${item.year}: ${formatKpiValue(item.target, k.unit)}`).join(" · ") || "Sem meta futura"])} /></section>
  </>;
}

type ReportSectionKey = "indicators" | "prospectedCompanies" | "contractedProjects" | "openNegotiations";

function Reports({ data, availableYears }: { data: Snapshot; availableYears: number[] }) {
  const [range, setRange] = useState<DateRange>(() => rangeForPreset("currentYear"));
  const [preset, setPreset] = useState<PeriodPreset>("currentYear");
  const [sections, setSections] = useState<Record<ReportSectionKey, boolean>>({ indicators: true, prospectedCompanies: true, contractedProjects: true, openNegotiations: true });
  const [excludedKpiIds, setExcludedKpiIds] = useState<number[]>([]);

  const metrics = useMemo(() => calculateMetrics(data, range), [data, range]);
  const periodYear = range.start.slice(0, 4) === range.end.slice(0, 4) ? Number(range.start.slice(0, 4)) : null;
  const selectedKpis = data.kpis.filter((kpi) => !excludedKpiIds.includes(kpi.id));
  const contactsInPeriod = data.contacts.filter((contact) => inRange(contact.prospectingDate || contact.createdAt, range));
  const prospectedCompanies = Array.from(new Set(contactsInPeriod.map((contact) => contact.companyId).filter((id): id is number => Boolean(id))))
    .map((companyId) => {
      const company = data.companies.find((item) => item.id === companyId);
      const contacts = contactsInPeriod.filter((item) => item.companyId === companyId).sort((a, b) => (a.prospectingDate || "").localeCompare(b.prospectingDate || ""));
      return company ? { company, contacts, firstDate: contacts[0]?.prospectingDate ?? "", lastDate: contacts.at(-1)?.prospectingDate ?? "" } : null;
    })
    .filter((item): item is { company: Company; contacts: Contact[]; firstDate: string; lastDate: string } => Boolean(item))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.company.tradeName.localeCompare(b.company.tradeName, "pt-BR"));
  const contractedProjects = data.opportunities.filter((item) => item.stage === "Contratada" && inRange(item.contractDate, range)).sort((a, b) => b.contractDate.localeCompare(a.contractDate));
  const openNegotiations = data.opportunities.filter((item) => ["Aberto", "Aceito"].includes(item.sourceStatus ?? "") && inRange(item.sentDate || item.proposalDate || item.createdAt, range)).sort((a, b) => (b.sentDate || b.proposalDate || b.createdAt || "").localeCompare(a.sentDate || a.proposalDate || a.createdAt || ""));

  const averageForRange = (startField: "sentDate" | "acceptedDate", endField: "acceptedDate" | "contractDate") => {
    const values = data.opportunities
      .filter((item) => inRange(item[endField], range))
      .map((item) => elapsedDays(item[startField], item[endField]))
      .filter((value): value is number => value !== null);
    return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  };
  const reportKpiActual = (kpi: KPI) => {
    switch (kpi.measurementMethod) {
      case "Organizações do tipo Empresa cadastradas no ano": return metrics.mapped;
      case "Contatos prospectados no ano": return metrics.prospected;
      case "Propostas técnicas enviadas no ano": return metrics.proposals;
      case "Projetos contratados no ano": return metrics.contracted;
      case "Empresas contratantes únicas no ano": return metrics.contractingCompanies;
      case "Startups/MPEs contratantes no ano": return metrics.mpeStartup;
      case "Tempo médio de negociação concluída no ano": return averageForRange("sentDate", "acceptedDate");
      case "Tempo médio de contratação concluída no ano": return averageForRange("acceptedDate", "contractDate");
      default: return periodYear ? annualTarget(kpi, periodYear)?.manualActual ?? 0 : 0;
    }
  };
  const reportKpis = selectedKpis.map((kpi) => {
    const actual = reportKpiActual(kpi);
    const goal = periodYear ? annualTarget(kpi, periodYear)?.target : undefined;
    const attainment = goal ? Math.round(kpiAttainment(actual, goal, kpi.direction)) : null;
    return { kpi, actual, goal, attainment };
  });

  function applyReportPreset(nextPreset: Exclude<PeriodPreset, "custom" | "year">) {
    setPreset(nextPreset);
    setRange(rangeForPreset(nextPreset));
  }
  function selectReportYear(year: number) {
    setPreset(year === currentYear() ? "currentYear" : "year");
    setRange(rangeForYear(year));
  }
  function changeReportRange(field: keyof DateRange, value: string) {
    setPreset("custom");
    setRange((current) => field === "start" ? { start: value, end: value > current.end ? value : current.end } : { start: value < current.start ? value : current.start, end: value });
  }
  function toggleSection(key: ReportSectionKey) {
    setSections((current) => ({ ...current, [key]: !current[key] }));
  }
  function toggleKpi(id: number) {
    setExcludedKpiIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }
  function exportReport() {
    const excelSections: ReportExcelSection[] = [];
    if (sections.indicators) excelSections.push({ name: "Indicadores", columns: [
      { header: "Indicador", key: "indicator", width: 34 }, { header: "Realizado no período", key: "actual", width: 20, type: "number" }, { header: "Unidade", key: "unit", width: 16 },
      { header: "Meta anual", key: "goal", width: 16, type: "number" }, { header: "Atendimento (%)", key: "attainment", width: 18, type: "number" }, { header: "Direção", key: "direction", width: 24 }, { header: "Peso", key: "weight", width: 10, type: "integer" },
    ], rows: reportKpis.map(({ kpi, actual, goal, attainment }) => ({ indicator: kpi.label, actual, unit: kpi.unit, goal: goal ?? "", attainment: attainment ?? "", direction: kpi.direction, weight: kpi.weight })) });
    if (sections.prospectedCompanies) excelSections.push({ name: "Empresas prospectadas", columns: [
      { header: "Empresa", key: "company", width: 28 }, { header: "CNPJ", key: "cnpj", width: 20 }, { header: "Setor", key: "sector", width: 24 }, { header: "UF", key: "uf", width: 8 },
      { header: "Contatos prospectados", key: "contacts", width: 36 }, { header: "Primeira prospecção", key: "firstDate", width: 19, type: "date" }, { header: "Última prospecção", key: "lastDate", width: 19, type: "date" }, { header: "Responsável", key: "responsible", width: 24 },
    ], rows: prospectedCompanies.map(({ company, contacts, firstDate, lastDate }) => ({ company: company.tradeName, cnpj: company.cnpj, sector: company.sector, uf: company.uf, contacts: contacts.map((item) => item.name).join("; "), firstDate, lastDate, responsible: responsibleName(data, contacts.at(-1)?.responsibleUserId ?? company.responsibleUserId) })) });
    if (sections.contractedProjects) excelSections.push({ name: "Projetos contratados", columns: [
      { header: "Código do projeto", key: "projectCode", width: 20 }, { header: "Código da negociação", key: "sourceCode", width: 21 }, { header: "Projeto", key: "title", width: 34 }, { header: "Empresa", key: "company", width: 27 },
      { header: "Conclusão da contratação", key: "contractDate", width: 22, type: "date" }, { header: "Valor total", key: "totalValue", width: 18, type: "currency" }, { header: "Modalidade", key: "modality", width: 21 }, { header: "Responsável", key: "responsible", width: 24 },
    ], rows: contractedProjects.map((item) => ({ projectCode: item.projectCode ?? "", sourceCode: item.sourceCode ?? "", title: item.title, company: companyName(data, item.companyId), contractDate: item.contractDate, totalValue: item.totalValue, modality: item.modality, responsible: responsibleName(data, item.responsibleUserId, item.owner) })) });
    if (sections.openNegotiations) excelSections.push({ name: "Negociações abertas", columns: [
      { header: "Código", key: "sourceCode", width: 18 }, { header: "Oportunidade", key: "title", width: 34 }, { header: "Empresa", key: "company", width: 27 }, { header: "Etapa", key: "stage", width: 18 }, { header: "Resultado", key: "result", width: 14 },
      { header: "Proposta enviada em", key: "sentDate", width: 19, type: "date" }, { header: "Valor total", key: "totalValue", width: 18, type: "currency" }, { header: "Probabilidade (%)", key: "probability", width: 18, type: "number" }, { header: "Próximo passo", key: "nextStep", width: 34 }, { header: "Responsável", key: "responsible", width: 24 },
    ], rows: openNegotiations.map((item) => ({ sourceCode: item.sourceCode ?? "", title: item.title, company: companyName(data, item.companyId), stage: item.stage, result: item.sourceStatus ?? "", sentDate: item.sentDate, totalValue: item.totalValue, probability: item.probability, nextStep: item.nextStep, responsible: responsibleName(data, item.responsibleUserId, item.owner) })) });
    if (!excelSections.length) return;
    const bytes = createConfigurableReportExcel(excelSections, `Relatório CTNano · ${formatRange(range)}`);
    const blob = new Blob([new Uint8Array(bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Relatorio_CTNano_${range.start}_a_${range.end}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const selectedYear = periodYear && availableYears.includes(periodYear) ? String(periodYear) : "";
  const hasSection = Object.values(sections).some(Boolean);
  return <div className="reports-page">
    <section className="welcome-row report-screen-only"><div><h2>Relatórios</h2><p>Configure o período, os indicadores e as listas que serão incluídas.</p></div></section>
    <section className="panel report-config report-screen-only">
      <div className="report-config-block"><div><p className="eyebrow">Período</p><h3>Intervalo de apuração</h3></div><div className="quick-periods"><button className={preset === "currentYear" ? "active" : ""} onClick={() => applyReportPreset("currentYear")}>Ano atual</button><button className={preset === "currentMonth" ? "active" : ""} onClick={() => applyReportPreset("currentMonth")}>Mês atual</button><button className={preset === "last7Days" ? "active" : ""} onClick={() => applyReportPreset("last7Days")}>Últimos 7 dias</button></div><label className="year-filter"><span>Ano dos registros</span><select value={selectedYear} onChange={(event) => { if (event.target.value) selectReportYear(Number(event.target.value)); }}><option value="">Selecionar ano</option>{availableYears.map((year) => <option value={year} key={year}>{year}</option>)}</select></label><div className="report-date-range"><label><span>Data inicial</span><input type="date" value={range.start} max={range.end} onChange={(event) => changeReportRange("start", event.target.value)} /></label><span>até</span><label><span>Data final</span><input type="date" value={range.end} min={range.start} onChange={(event) => changeReportRange("end", event.target.value)} /></label></div></div>
      <div className="report-config-block"><div><p className="eyebrow">Conteúdo</p><h3>Seções do relatório</h3></div><div className="report-option-grid">{([
        ["indicators", "Indicadores", "Resultados dos indicadores selecionados"], ["prospectedCompanies", "Empresas prospectadas", "Organizações com contatos no período"], ["contractedProjects", "Projetos contratados", "Oportunidades contratadas no período"], ["openNegotiations", "Negociações abertas", "Resultados Em aberto e Aceito no período"],
      ] as [ReportSectionKey, string, string][]).map(([key, label, detail]) => <label className="report-option" key={key}><input type="checkbox" checked={sections[key]} onChange={() => toggleSection(key)} /><span><strong>{label}</strong><small>{detail}</small></span></label>)}</div></div>
      {sections.indicators && <div className="report-config-block wide"><div className="report-config-title"><div><p className="eyebrow">Indicadores</p><h3>Escolha os indicadores</h3></div><div><button className="text-button" onClick={() => setExcludedKpiIds([])}>Selecionar todos</button><button className="text-button" onClick={() => setExcludedKpiIds(data.kpis.map((kpi) => kpi.id))}>Limpar</button></div></div><div className="report-kpi-options">{data.kpis.map((kpi) => <label key={kpi.id}><input type="checkbox" checked={!excludedKpiIds.includes(kpi.id)} onChange={() => toggleKpi(kpi.id)} /><span>{kpi.label}</span></label>)}</div></div>}
      <div className="report-actions wide"><span>Período selecionado: <strong>{formatRange(range)}</strong></span><button className="secondary-button" disabled={!hasSection} onClick={() => window.print()}>Imprimir / salvar PDF</button><button className="primary-button" disabled={!hasSection} onClick={exportReport}>Exportar Excel</button></div>
    </section>
    {!hasSection ? <section className="panel report-empty report-screen-only">Selecione ao menos uma seção para gerar o relatório.</section> : <article className="report-output">
      <section className="report-cover-page">
        <header className="report-document-header"><div className="report-document-brand"><img src="/ctnano-logo.webp" alt="CTNano/UFMG" /><div><p>CRM · Novos Negócios</p><h2>Relatório comercial</h2></div></div><div><strong>{formatRange(range)}</strong><span>Gerado em {new Date().toLocaleString("pt-BR")}</span></div></header>
        <div className="report-chart-grid">
          <section className="report-chart-panel">
            <div className="panel-heading"><div><p className="eyebrow">Evolução no período</p><h3>Prospecções, propostas e contratos</h3></div></div>
            <EvolutionLineChart items={metrics.timeline} />
          </section>
          <section className="report-chart-panel">
            <div className="panel-heading"><div><p className="eyebrow">Conversão</p><h3>Funil comercial no período</h3></div></div>
            <CommercialFunnel metrics={metrics} />
          </section>
        </div>
      </section>
      {sections.indicators && <section className="report-section"><div className="report-section-title"><div><p className="eyebrow">Desempenho</p><h3>Indicadores</h3></div><span>{reportKpis.length} selecionados</span></div><DataTable headers={["Indicador", "Realizado", "Meta anual", "Atendimento", "Unidade", "Peso"]} rows={reportKpis.map(({ kpi, actual, goal, attainment }) => [<strong key="kpi">{kpi.label}</strong>, formatKpiValue(actual, kpi.unit), goal === undefined ? "—" : formatKpiValue(goal, kpi.unit), attainment === null ? "—" : `${attainment}%`, kpi.unit, number.format(kpi.weight)])} /></section>}
      {sections.prospectedCompanies && <section className="report-section"><div className="report-section-title"><div><p className="eyebrow">Prospecção</p><h3>Empresas prospectadas</h3></div><span>{prospectedCompanies.length} empresas · {contactsInPeriod.length} contatos</span></div><DataTable headers={["Empresa", "CNPJ", "Setor", "UF", "Contatos", "Última prospecção", "Responsável"]} rows={prospectedCompanies.map(({ company, contacts, lastDate }) => [<div key="company"><strong>{company.tradeName}</strong><small className="block">{company.legalName}</small></div>, company.cnpj || "—", company.sector || "—", company.uf || "—", contacts.map((item) => item.name).join(", "), date(lastDate), responsibleName(data, contacts.at(-1)?.responsibleUserId ?? company.responsibleUserId)])} /></section>}
      {sections.contractedProjects && <section className="report-section"><div className="report-section-title"><div><p className="eyebrow">Contratações</p><h3>Projetos contratados</h3></div><span>{contractedProjects.length} projetos · {money.format(contractedProjects.reduce((sum, item) => sum + item.totalValue, 0))}</span></div><DataTable headers={["Código do projeto", "Projeto", "Empresa", "Contratação", "Valor", "Modalidade", "Responsável"]} rows={contractedProjects.map((item) => [item.projectCode || "—", <div key="project"><strong>{item.title}</strong><small className="block">Negociação: {item.sourceCode || "—"}</small></div>, companyName(data, item.companyId), date(item.contractDate), money.format(item.totalValue), item.modality, responsibleName(data, item.responsibleUserId, item.owner)])} /></section>}
      {sections.openNegotiations && <section className="report-section"><div className="report-section-title"><div><p className="eyebrow">Pipeline</p><h3>Negociações em aberto e aceitas</h3></div><span>{openNegotiations.length} negociações · {money.format(openNegotiations.reduce((sum, item) => sum + item.totalValue, 0))}</span></div><DataTable headers={["Oportunidade", "Empresa", "Etapa", "Resultado", "Envio", "Valor", "Probabilidade", "Próximo passo", "Responsável"]} rows={openNegotiations.map((item) => [<div key="opportunity"><strong>{item.title}</strong><small className="block">{item.sourceCode || "Sem código"}</small></div>, companyName(data, item.companyId), <Status key="stage" value={item.stage} />, <Status key="result" value={item.sourceStatus || "Aberto"} />, date(item.sentDate), money.format(item.totalValue), `${number.format(item.probability)}%`, item.nextStep || "—", responsibleName(data, item.responsibleUserId, item.owner)])} /></section>}
      <footer className="report-document-footer">CTNano/UFMG · Relatório gerado pelo CRM institucional</footer>
    </article>}
  </div>;
}

function Settings({ data, onBackup, onImport, addKpi, editKpi, deleteKpi, addUser, editUser, canManageKpis }: { data: Snapshot; onBackup: () => void; onImport: (file: File) => void; addKpi: () => void; editKpi: (record: KPI) => void; deleteKpi: (record: KPI) => void; addUser: () => void; editUser: (record: CRMUser) => void; canManageKpis: boolean }) {
  const totalWeight = data.kpis.reduce((sum, kpi) => sum + (Number(kpi.weight) || 0), 0);
  return <div className="settings-grid">
    <section className="panel list-panel kpi-settings"><div className="list-toolbar"><div><p className="eyebrow">Indicadores</p><h3>Cadastro de indicadores</h3><small>{data.kpis.length} indicadores · soma dos pesos {number.format(totalWeight)} · {canManageKpis ? "acesso administrativo" : "somente leitura"}</small></div>{canManageKpis && <button className="primary-button compact" onClick={addKpi}>＋ Novo indicador</button>}</div><DataTable headers={["Indicador", "Responsável", "Forma de apuração", "Unidade", "Direção", "Peso", "Metas anuais", "No Painel", ""]} rows={data.kpis.map((kpi) => [<strong key="name">{kpi.label}</strong>, responsibleName(data, kpi.responsibleUserId), kpi.measurementMethod, kpi.unit, kpi.direction, number.format(kpi.weight), annualTargets(kpi).filter((item) => item.year >= currentYear()).sort((a, b) => a.year - b.year).map((item) => `${item.year}: ${formatKpiValue(item.target, kpi.unit)}`).join(" · ") || "—", <Status key="dashboard" value={isShownOnDashboard(kpi) ? "Sim" : "Não"} />, canManageKpis ? <div className="row-actions" key="actions"><button className="row-action" onClick={() => editKpi(kpi)}>Editar</button>{kpi.key.startsWith("custom_") && <button className="row-action danger-action" onClick={() => deleteKpi(kpi)}>Excluir</button>}</div> : <span key="locked" className="locked-label">Administrador</span>])} /></section>
    {canManageKpis && <section className="panel settings-card"><div className="settings-icon">G</div><div><p className="eyebrow">Integração</p><h3>Backup no Google Drive</h3><p>Gere uma cópia JSON completa dos usuários, organizações, contatos, oportunidades, atividades, projetos e metas. O arquivo é enviado à pasta configurada no Drive.</p></div><button className="primary-button" onClick={onBackup}>Criar backup agora</button><div className="backup-history"><strong>Histórico recente</strong>{data.backups.length ? data.backups.slice(0, 5).map((backup) => <div key={backup.id}><span className="success-dot" /><div><strong>{backup.fileName}</strong><small>{new Date(backup.createdAt).toLocaleString("pt-BR")}</small></div><Status value={backup.status} /></div>) : <p>Nenhum backup registrado nesta instância.</p>}</div></section>}
    <section className="panel settings-card"><div className="settings-icon">⇩</div><div><p className="eyebrow">Portabilidade</p><h3>Exportar ou importar</h3><p>Exporte todos os dados comerciais para Excel. O backup e a importação integral ficam restritos aos administradores.</p></div><a className="primary-button full center" href="/api/export-excel">Exportar dados para Excel</a>{canManageKpis && <><a className="secondary-button full center" href="/api/export">Baixar backup JSON</a><label className="secondary-button full file-button">Importar arquivo JSON<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ""; }} /></label></>}</section>
    <section className="panel list-panel team-settings"><div className="list-toolbar"><div><p className="eyebrow">Equipe</p><h3>Cadastro de usuários</h3><small>{data.users.length} usuários cadastrados · acesso exclusivo para @ctnano.org</small></div>{canManageKpis && <button className="primary-button compact" onClick={addUser}>＋ Novo usuário</button>}</div><DataTable headers={["Usuário", "E-mail", "Telefone", "Perfil", "Status", ""]} rows={data.users.map((user) => [<div className="user-cell" key={user.id}><span>{user.fullName.split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span><strong>{user.fullName}</strong></div>, user.email, user.phone || "—", <Status key="role" value={user.role === "admin" ? "Administrador" : "Usuário"} />, <Status key="status" value={user.active ? "Ativo" : "Inativo"} />, canManageKpis ? <button key="edit" className="row-action" onClick={() => editUser(user)}>Editar</button> : <span key="locked" className="locked-label">Administrador</span>])} /></section>
  </div>;
}

function ActivityPrompt({ close, create }: { close: () => void; create: () => void }) {
  return <div className="modal-backdrop"><section className="modal confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="activity-prompt-title"><div className="confirmation-icon">✓</div><div><p className="eyebrow">Cadastro concluído</p><h2 id="activity-prompt-title">Deseja criar uma nova atividade?</h2><p>Podemos abrir o cadastro de atividade com a organização, a oportunidade e a pessoa responsável já preenchidas quando disponíveis.</p></div><footer><button className="secondary-button" onClick={close}>Agora não</button><button className="primary-button" onClick={create}>Criar atividade</button></footer></section></div>;
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return <div className="table-scroll"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>) : <tr><td className="empty" colSpan={headers.length}>Nenhum registro encontrado.</td></tr>}</tbody></table></div>;
}

function Status({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const tone = normalized.includes("encerr") || normalized.includes("perdid") || normalized.includes("cancel") ? "danger" : normalized.includes("contrat") || normalized.includes("ativa") || normalized.includes("conclu") || normalized.includes("execução") || normalized.includes("sucesso") ? "success" : normalized.includes("pendente") || normalized.includes("proposta") || normalized.includes("handover") ? "warning" : normalized.includes("negocia") || normalized.includes("qualificada") ? "info" : "neutral";
  return <span className={`status ${tone}`}>{value}</span>;
}

function RecordModal({ modal, snapshot, close, save }: { modal: { entity: Entity; record?: Record<string, unknown> }; snapshot: Snapshot; close: () => void; save: (entity: Entity, values: Record<string, unknown>) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [opportunityStage, setOpportunityStage] = useState(String(modal.record?.stage ?? stages[0]));
  const [opportunityResult, setOpportunityResult] = useState(String(modal.record?.sourceStatus || "Aberto"));
  const [opportunityDates, setOpportunityDates] = useState({ sentDate: String(modal.record?.sentDate ?? ""), acceptedDate: String(modal.record?.acceptedDate ?? ""), contractDate: String(modal.record?.contractDate ?? "") });
  const editingKpi = modal.entity === "kpis" && modal.record ? modal.record as unknown as KPI : null;
  const [kpiMeasurementMethod, setKpiMeasurementMethod] = useState(String(modal.record?.measurementMethod ?? measurementMethods[0]));
  const [kpiTargets, setKpiTargets] = useState<KpiAnnualTarget[]>(() => editingKpi ? annualTargets(editingKpi) : [{ year: currentYear(), target: 0, manualActual: 0 }]);
  const selectableKpiYears = Array.from({ length: 10 }, (_, index) => currentYear() + index);
  const definitions: Record<Entity, { label: string; fields: [string, string, string, string[]?][] }> = {
    users: { label: "usuário", fields: [["fullName", "Nome completo", "text"], ["email", "E-mail @ctnano.org", "email"], ["phone", "Telefone", "tel"], ["role", "Perfil de acesso", "select", ["user", "admin"]], ["active", "Usuário ativo", "checkbox"]] },
    companies: { label: "organização", fields: [["tradeName", "Nome fantasia", "text"], ["legalName", "Razão social", "text"], ["cnpj", "CNPJ", "text"], ["organizationType", "Tipo de organização", "select", ["Empresa", "Governo", "Investidor", "Outras"]], ["mappingDate", "Data de mapeamento", "date"], ["responsibleUserId", "Pessoa responsável", "user"], ["size", "Porte", "select", ["Startup", "MPE", "Média", "Grande", "Outros"]], ["sector", "Setor industrial", "text"], ["uf", "UF", "text"], ["status", "Status", "select", ["Ativa", "Inativa"]]] },
    contacts: { label: "contato", fields: [["name", "Nome", "text"], ["companyId", "Organização", "company"], ["responsibleUserId", "Pessoa responsável", "user"], ["email", "E-mail", "email"], ["phone", "Telefone", "tel"], ["role", "Cargo", "text"], ["prospectingDate", "Data da prospecção", "date"], ["source", "Origem", "select", ["Prospecção ativa", "Evento", "Indicação", "Site", "Outro"]]] },
    opportunities: { label: "oportunidade", fields: [["sourceCode", "Código da negociação", "text"], ["projectCode", "Código do projeto", "text"], ["title", "Título", "text"], ["companyId", "Empresa", "company"], ["responsibleUserId", "Pessoa responsável", "user"], ["stage", "Etapa", "select", stages], ["sourceStatus", "Resultado", "select", ["Aberto", "Aceito", "Perdido"]], ["lossReason", "Motivo da perda", "text"], ["origin", "Origem", "text"], ["technicalTeam", "Equipe técnica", "text"], ["modality", "Modalidade", "select", ["EMBRAPII CG", "ROTA 2030", "SEBRAE DT", "SEBRAE ET", "Alta Alavancagem", "Ministério da Saúde", "Outro"]], ["uf", "UF", "text"], ["totalValue", "Valor total (R$)", "number"], ["companyValue", "Valor da empresa (R$)", "number"], ["economicValue", "Valor econômico (R$)", "number"], ["embrapiiValue", "Participação EMBRAPII (R$)", "number"], ["probability", "Probabilidade (%)", "number"], ["proposalDate", "Data de elaboração", "date"], ["sentDate", "Proposta enviada em", "date"], ["acceptedDate", "Data de aceite/recusa", "date"], ["contractDate", "Conclusão da contratação", "date"], ["nextStep", "Próximo passo", "text"], ["dueDate", "Expectativa de fechamento", "date"]] },
    activities: { label: "atividade", fields: [["title", "Título", "text"], ["companyId", "Empresa", "company"], ["opportunityId", "Oportunidade", "opportunity"], ["responsibleUserId", "Pessoa responsável", "user"], ["type", "Tipo", "select", ["Tarefa", "Reunião", "Follow-up", "Nota"]], ["dueDate", "Prazo", "date"], ["status", "Status", "select", ["Pendente", "Concluída", "Cancelada"]], ["notes", "Observações", "textarea"]] },
    projects: { label: "projeto", fields: [["name", "Nome", "text"], ["companyId", "Empresa", "company"], ["opportunityId", "Oportunidade de origem", "opportunity"], ["responsibleUserId", "Pessoa responsável", "user"], ["status", "Status", "select", ["Handover", "Em execução", "Suspenso", "Concluído"]], ["startDate", "Início", "date"], ["endDate", "Término", "date"], ["handoverProgress", "Handover (%)", "number"], ["totalValue", "Valor total (R$)", "number"]] },
    kpis: { label: "indicador", fields: [["label", "Nome do indicador", "text"], ["responsibleUserId", "Pessoa responsável", "user"], ["measurementMethod", "Forma de apuração", "select", measurementMethods], ["unit", "Unidade", "select", ["Percentual", "Unidade", "Monetário", "Outro"]], ["direction", "Direção da meta", "select", ["Quanto maior, melhor", "Quanto menor, melhor"]], ["weight", "Peso (1 a 5)", "number"], ["showOnDashboard", "Mostrar este indicador no Painel", "checkbox"]] },
  };
  const definition = definitions[modal.entity];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget); const values: Record<string, unknown> = {};
    definition.fields.forEach(([name, , type]) => { const raw = form.get(name)?.toString() ?? ""; values[name] = type === "checkbox" ? form.has(name) : ["number", "company", "opportunity", "user"].includes(type) ? (raw ? Number(raw) : null) : raw; });
    if (modal.entity === "companies") {
      if (!values.mappingDate) { setError("Informe a data de mapeamento da organização."); setSaving(false); return; }
      if (!isValidCnpj(String(values.cnpj ?? ""))) { setError("Informe um CNPJ brasileiro válido ou deixe o campo vazio."); setSaving(false); return; }
    }
    if (modal.entity === "opportunities") {
      if (values.stage !== "Contratada") values.projectCode = String(modal.record?.projectCode ?? "");
      values.dueDate = expectedClosingDate(snapshot, String(values.sourceStatus ?? ""), String(values.acceptedDate ?? ""));
      const negotiationDays = elapsedDays(String(values.sentDate ?? ""), String(values.acceptedDate ?? ""));
      const contractingDays = elapsedDays(String(values.acceptedDate ?? ""), String(values.contractDate ?? ""));
      if (values.sentDate && values.acceptedDate && negotiationDays === null) { setError("A data de aceite/recusa não pode ser anterior ao envio da proposta."); setSaving(false); return; }
      if (values.acceptedDate && values.contractDate && contractingDays === null) { setError("A conclusão da contratação não pode ser anterior à data de aceite/recusa."); setSaving(false); return; }
    }
    if (modal.entity === "kpis") {
      const selected = kpiTargets.filter((item) => item.year >= currentYear());
      if (selected.length < 1 || selected.length > 5) { setError("Selecione de 1 a 5 anos, começando pelo ano atual."); setSaving(false); return; }
      values.targets = [...kpiTargets].sort((a, b) => a.year - b.year);
    }
    if (modal.record?.id) values.id = modal.record.id;
    try { await save(modal.entity, values); } catch (e) { setError(e instanceof Error ? e.message : "Erro ao salvar."); setSaving(false); }
  }
  const negotiationPreview = elapsedDays(opportunityDates.sentDate, opportunityDates.acceptedDate);
  const contractingPreview = elapsedDays(opportunityDates.acceptedDate, opportunityDates.contractDate);
  const expectedClosingPreview = expectedClosingDate(snapshot, opportunityResult, opportunityDates.acceptedDate);
  const isEdit = Boolean(modal.record?.id);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal" role="dialog" aria-modal="true">
      <header><div><p className="eyebrow">{isEdit ? "Editar" : "Novo cadastro"}</p><h2>{isEdit ? `Editar ${definition.label}` : `${["kpis", "projects", "users"].includes(modal.entity) ? "Novo" : "Nova"} ${definition.label}`}</h2></div><button onClick={close} aria-label="Fechar">×</button></header>
      <form onSubmit={submit}>
        <div className="form-grid">{definition.fields.map(([name, label, type, options]) => {
          const isContractDate = modal.entity === "opportunities" && name === "contractDate";
          const isProjectCode = modal.entity === "opportunities" && name === "projectCode";
          const isExpectedClosing = modal.entity === "opportunities" && name === "dueDate";
          const onDateChange = modal.entity === "opportunities" && ["sentDate", "acceptedDate", "contractDate"].includes(name) ? (event: React.ChangeEvent<HTMLInputElement>) => setOpportunityDates((current) => ({ ...current, [name]: event.target.value })) : undefined;
          const isSystemMeasurement = modal.entity === "kpis" && name === "measurementMethod" && Boolean(systemKpiMethods[String(modal.record?.key ?? "")]);
          const isMeasurement = modal.entity === "kpis" && name === "measurementMethod";
          const selectValue = name === "stage" && modal.entity === "opportunities" ? opportunityStage : name === "sourceStatus" && modal.entity === "opportunities" ? opportunityResult : isMeasurement ? kpiMeasurementMethod : undefined;
          const selectChange = name === "stage" && modal.entity === "opportunities" ? (event: React.ChangeEvent<HTMLSelectElement>) => setOpportunityStage(event.target.value) : name === "sourceStatus" && modal.entity === "opportunities" ? (event: React.ChangeEvent<HTMLSelectElement>) => setOpportunityResult(event.target.value) : isMeasurement ? (event: React.ChangeEvent<HTMLSelectElement>) => setKpiMeasurementMethod(event.target.value) : undefined;
          return <label key={name} className={type === "textarea" || type === "checkbox" ? "wide" : ""}><span>{label}</span>{
            type === "select" ? <select name={name} value={selectValue} defaultValue={selectValue === undefined ? String(modal.record?.[name] ?? options?.[0] ?? "") : undefined} onChange={selectChange} disabled={isSystemMeasurement}>{options?.map((option) => <option value={option} key={option}>{name === "role" ? option === "admin" ? "Administrador" : "Usuário" : option}</option>)}</select>
              : type === "company" ? <select name={name} defaultValue={String(modal.record?.[name] ?? "")} required><option value="">Selecione...</option>{snapshot.companies.map((company) => <option value={company.id} key={company.id}>{company.tradeName}</option>)}</select>
                : type === "opportunity" ? <select name={name} defaultValue={String(modal.record?.[name] ?? "")}><option value="">Sem vínculo</option>{snapshot.opportunities.map((opportunity) => <option value={opportunity.id} key={opportunity.id}>{opportunity.title}</option>)}</select>
                  : type === "user" ? <select name={name} defaultValue={String(modal.record?.[name] ?? "")} required><option value="">Selecione...</option>{snapshot.users.filter((user) => user.active || user.id === Number(modal.record?.[name])).map((user) => <option value={user.id} key={user.id}>{user.fullName}</option>)}</select>
                    : type === "textarea" ? <textarea name={name} defaultValue={String(modal.record?.[name] ?? "")} />
                    : type === "checkbox" ? <input className="checkbox-input" name={name} type="checkbox" defaultChecked={Boolean(modal.record ? modal.record[name] : true)} />
                      : <input name={name} type={type} value={isExpectedClosing ? expectedClosingPreview : undefined} defaultValue={isExpectedClosing ? undefined : String(modal.record?.[name] ?? "")} min={name === "weight" ? 1 : undefined} max={name === "weight" ? 5 : undefined} maxLength={name === "cnpj" ? 18 : undefined} placeholder={name === "cnpj" ? "00.000.000/0000-00" : undefined} step={name === "weight" ? 1 : type === "number" ? "any" : undefined} required={["tradeName", "name", "title", "label", "fullName", "email"].includes(name)} disabled={isExpectedClosing || isProjectCode && opportunityStage !== "Contratada"} onChange={onDateChange} aria-describedby={isContractDate || isProjectCode || isExpectedClosing ? "contract-date-rule" : undefined} />
          }</label>;
        })}</div>
        {modal.entity === "kpis" && <section className="kpi-year-editor"><header><div><strong>Metas anuais</strong><span>Escolha até cinco anos a partir de {currentYear()}.</span></div><small>{kpiTargets.filter((item) => item.year >= currentYear()).length}/5 anos selecionados</small></header><div className="kpi-year-list">{selectableKpiYears.map((year) => {
          const row = kpiTargets.find((item) => item.year === year);
          const selectedCount = kpiTargets.filter((item) => item.year >= currentYear()).length;
          return <div className={`kpi-year-row ${row ? "selected" : ""}`} key={year}><label className="year-choice"><input type="checkbox" checked={Boolean(row)} onChange={(event) => {
            if (!event.target.checked) { setKpiTargets((current) => current.filter((item) => item.year !== year)); return; }
            if (selectedCount >= 5) { setError("É possível selecionar no máximo cinco anos."); return; }
            setError(""); setKpiTargets((current) => [...current, { year, target: 0, manualActual: 0 }].sort((a, b) => a.year - b.year));
          }} /><strong>{year}</strong></label>{row && <><label><span>Valor da meta</span><input type="number" step="any" value={row.target} onChange={(event) => setKpiTargets((current) => current.map((item) => item.year === year ? { ...item, target: Number(event.target.value) } : item))} /></label><label><span>Realizado manual</span><input type="number" step="any" value={row.manualActual} disabled={kpiMeasurementMethod !== "Apuração manual"} onChange={(event) => setKpiTargets((current) => current.map((item) => item.year === year ? { ...item, manualActual: Number(event.target.value) } : item))} /></label></>}</div>;
        })}</div>{kpiTargets.some((item) => item.year < currentYear()) && <p className="historical-targets">Metas de anos anteriores foram preservadas no histórico e não são alteradas nesta tela.</p>}</section>}
        {modal.entity === "opportunities" && <><div className="opportunity-time-preview"><div><span>Tempo de negociação</span><strong>{durationLabel(negotiationPreview)}</strong></div><div><span>Tempo de contratação</span><strong>{durationLabel(contractingPreview)}</strong></div><div><span>Expectativa de fechamento</span><strong>{date(expectedClosingPreview)}</strong></div></div><p className="form-hint" id="contract-date-rule">A conclusão da contratação pode ser editada em qualquer etapa. O código do projeto é habilitado quando a etapa for “Contratada”. A expectativa de fechamento é bloqueada e calculada quando o resultado é “Aceito”: data de aceite/recusa + {snapshot.insights.averageContractingDays === null ? "tempo médio de contratação disponível" : `${snapshot.insights.averageContractingDays} dias de tempo médio de contratação`}.</p></>}
        {modal.entity === "kpis" && <p className="form-hint">O campo “Realizado manual” é habilitado apenas para apuração manual. A forma de apuração dos indicadores automáticos é protegida pelo sistema, e a opção de exibição no Painel pode ser alterada a qualquer momento.</p>}
        {error && <p className="form-error">{error}</p>}
        <footer><button type="button" className="secondary-button" onClick={close}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando..." : "Salvar registro"}</button></footer>
      </form>
    </section>
  </div>;
}
