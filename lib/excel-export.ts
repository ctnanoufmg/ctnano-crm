import { strToU8, zipSync } from "fflate";

type ExportUser = { id: number; fullName: string; email: string };
type ExportCompany = {
  id: number; tradeName: string; legalName: string; cnpj: string; organizationType: string; mappingDate: string;
  size: string; sector: string; uf: string; status: string; responsibleUserId?: number | null; createdAt?: string;
};
type ExportContact = {
  id: number; companyId: number | null; name: string; email: string; phone: string; role: string; prospectingDate: string;
  source: string; responsibleUserId?: number | null; createdAt?: string;
};
type ExportOpportunity = {
  id: number; companyId: number; sourceCode?: string; title: string; stage: string; sourceStatus?: string; lossReason?: string;
  origin?: string; technicalTeam?: string; modality: string; totalValue: number; companyValue: number; economicValue?: number;
  embrapiiValue?: number; probability: number; owner: string; responsibleUserId?: number | null; uf?: string;
  proposalDate: string; sentDate: string; acceptedDate?: string; contractDate: string; negotiationDays?: number;
  contractingDays?: number; nextStep: string; dueDate: string; createdAt?: string;
};

export type CRMExcelData = {
  users: ExportUser[];
  companies: ExportCompany[];
  contacts: ExportContact[];
  opportunities: ExportOpportunity[];
};

type CellType = "text" | "date" | "currency" | "percent" | "integer" | "number";
type Column<T> = { header: string; value: (row: T) => unknown; width: number; type?: CellType };

const xmlEscape = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function columnName(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function excelDate(value: unknown) {
  const text = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const time = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(time) ? Math.floor(time / 86400000) + 25569 : null;
}

function cellXml(reference: string, value: unknown, type: CellType = "text") {
  if (value === null || value === undefined || value === "") return "";
  if (type === "date") {
    const serial = excelDate(value);
    return serial === null ? "" : `<c r="${reference}" s="2"><v>${serial}</v></c>`;
  }
  if (["currency", "percent", "integer", "number"].includes(type)) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "";
    const style = type === "currency" ? 3 : type === "percent" ? 4 : type === "integer" ? 5 : 7;
    const stored = type === "percent" ? numeric / 100 : numeric;
    return `<c r="${reference}" s="${style}"><v>${stored}</v></c>`;
  }
  return `<c r="${reference}" t="inlineStr" s="6"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function worksheetXml<T>(rows: T[], columns: Column<T>[]) {
  const lastColumn = columnName(columns.length - 1);
  const lastRow = Math.max(1, rows.length + 1);
  const header = columns.map((column, index) => `<c r="${columnName(index)}1" t="inlineStr" s="1"><is><t>${xmlEscape(column.header)}</t></is></c>`).join("");
  const body = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 2;
    const cells = columns.map((column, columnIndex) => cellXml(`${columnName(columnIndex)}${rowNumber}`, column.value(row), column.type)).join("");
    return `<row r="${rowNumber}" ht="20" customHeight="1">${cells}</row>`;
  }).join("");
  const widths = columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width}" customWidth="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${widths}</cols>
  <sheetData><row r="1" ht="32" customHeight="1">${header}</row>${body}</sheetData>
  <autoFilter ref="A1:${lastColumn}${lastRow}"/>
  <pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
</worksheet>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="5">
    <numFmt numFmtId="164" formatCode="&quot;R$&quot; #,##0.00"/>
    <numFmt numFmtId="165" formatCode="0%"/>
    <numFmt numFmtId="166" formatCode="#,##0"/>
    <numFmt numFmtId="167" formatCode="#,##0.00"/>
    <numFmt numFmtId="168" formatCode="dd/mm/yyyy"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="10"/><color rgb="FF172033"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/><family val="2"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF12305B"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left/><right/><top/><bottom style="thin"><color rgb="FFD7E0EA"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="168" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function userDetails(data: CRMExcelData, id?: number | null, legacyName = "") {
  const user = data.users.find((item) => item.id === id);
  return { name: user?.fullName ?? legacyName, email: user?.email ?? "" };
}

export function createCrmExcel(data: CRMExcelData) {
  const companyById = new Map(data.companies.map((company) => [company.id, company]));
  const organizations: Column<ExportCompany>[] = [
    { header: "ID", value: (row) => row.id, width: 9, type: "integer" },
    { header: "Nome fantasia", value: (row) => row.tradeName, width: 26 },
    { header: "Razão social", value: (row) => row.legalName, width: 34 },
    { header: "CNPJ", value: (row) => row.cnpj, width: 20 },
    { header: "Tipo de organização", value: (row) => row.organizationType, width: 20 },
    { header: "Data de mapeamento", value: (row) => row.mappingDate, width: 18, type: "date" },
    { header: "Porte", value: (row) => row.size, width: 14 },
    { header: "Setor industrial", value: (row) => row.sector, width: 24 },
    { header: "UF", value: (row) => row.uf, width: 8 },
    { header: "Status", value: (row) => row.status, width: 13 },
    { header: "Pessoa responsável", value: (row) => userDetails(data, row.responsibleUserId).name, width: 23 },
    { header: "E-mail do responsável", value: (row) => userDetails(data, row.responsibleUserId).email, width: 29 },
    { header: "Data de cadastro", value: (row) => row.createdAt, width: 17, type: "date" },
  ];
  const contacts: Column<ExportContact>[] = [
    { header: "ID", value: (row) => row.id, width: 9, type: "integer" },
    { header: "Nome", value: (row) => row.name, width: 25 },
    { header: "E-mail", value: (row) => row.email, width: 29 },
    { header: "Telefone", value: (row) => row.phone, width: 19 },
    { header: "Cargo", value: (row) => row.role, width: 22 },
    { header: "Organização", value: (row) => companyById.get(Number(row.companyId))?.tradeName ?? "", width: 25 },
    { header: "CNPJ da organização", value: (row) => companyById.get(Number(row.companyId))?.cnpj ?? "", width: 20 },
    { header: "Data da prospecção", value: (row) => row.prospectingDate, width: 18, type: "date" },
    { header: "Origem", value: (row) => row.source, width: 18 },
    { header: "Pessoa responsável", value: (row) => userDetails(data, row.responsibleUserId).name, width: 23 },
    { header: "E-mail do responsável", value: (row) => userDetails(data, row.responsibleUserId).email, width: 29 },
    { header: "Data de cadastro", value: (row) => row.createdAt, width: 17, type: "date" },
  ];
  const opportunities: Column<ExportOpportunity>[] = [
    { header: "ID", value: (row) => row.id, width: 9, type: "integer" },
    { header: "Código da negociação", value: (row) => row.sourceCode, width: 20 },
    { header: "Título", value: (row) => row.title, width: 32 },
    { header: "Organização", value: (row) => companyById.get(row.companyId)?.tradeName ?? "", width: 25 },
    { header: "CNPJ da organização", value: (row) => companyById.get(row.companyId)?.cnpj ?? "", width: 20 },
    { header: "Etapa", value: (row) => row.stage, width: 18 },
    { header: "Resultado", value: (row) => row.sourceStatus, width: 14 },
    { header: "Motivo da perda", value: (row) => row.lossReason, width: 25 },
    { header: "Origem", value: (row) => row.origin, width: 19 },
    { header: "Equipe técnica", value: (row) => row.technicalTeam, width: 24 },
    { header: "Modalidade", value: (row) => row.modality, width: 20 },
    { header: "UF", value: (row) => row.uf, width: 8 },
    { header: "Valor total", value: (row) => row.totalValue, width: 17, type: "currency" },
    { header: "Valor da empresa", value: (row) => row.companyValue, width: 17, type: "currency" },
    { header: "Valor econômico", value: (row) => row.economicValue, width: 17, type: "currency" },
    { header: "Valor EMBRAPII", value: (row) => row.embrapiiValue, width: 17, type: "currency" },
    { header: "Probabilidade", value: (row) => row.probability, width: 14, type: "percent" },
    { header: "Pessoa responsável", value: (row) => userDetails(data, row.responsibleUserId, row.owner).name, width: 23 },
    { header: "E-mail do responsável", value: (row) => userDetails(data, row.responsibleUserId, row.owner).email, width: 29 },
    { header: "Data de elaboração", value: (row) => row.proposalDate, width: 17, type: "date" },
    { header: "Proposta enviada em", value: (row) => row.sentDate, width: 17, type: "date" },
    { header: "Data de aceite/recusa", value: (row) => row.acceptedDate, width: 19, type: "date" },
    { header: "Conclusão da contratação", value: (row) => row.contractDate, width: 21, type: "date" },
    { header: "Tempo de negociação (dias)", value: (row) => row.negotiationDays, width: 22, type: "integer" },
    { header: "Tempo de contratação (dias)", value: (row) => row.contractingDays, width: 22, type: "integer" },
    { header: "Próximo passo", value: (row) => row.nextStep, width: 32 },
    { header: "Expectativa de fechamento", value: (row) => row.dueDate, width: 21, type: "date" },
    { header: "Data de cadastro", value: (row) => row.createdAt, width: 17, type: "date" },
  ];
  const sheets = [
    { name: "Organizações", xml: worksheetXml(data.companies, organizations) },
    { name: "Contatos", xml: worksheetXml(data.contacts, contacts) },
    { name: "Oportunidades", xml: worksheetXml(data.opportunities, opportunities) },
  ];
  const timestamp = new Date().toISOString();
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets><calcPr calcId="191029"/></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    "xl/styles.xml": strToU8(stylesXml()),
    "docProps/core.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Exportação CTNano CRM</dc:title><dc:creator>CTNano CRM</dc:creator><cp:lastModifiedBy>CTNano CRM</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>`),
    "docProps/app.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>CTNano CRM</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Planilhas</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${sheets.map((sheet) => `<vt:lpstr>${xmlEscape(sheet.name)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts></Properties>`),
  };
  sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheet.xml); });
  return zipSync(files, { level: 6 });
}
