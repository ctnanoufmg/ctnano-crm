/* eslint-disable @typescript-eslint/no-require-imports -- The test harness loads transpiled server modules with isolated dependencies. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relativePath, mocks = {}, extra = '') {
  const file = path.join(__dirname, '..', relativePath);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8') + extra, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('.')) throw new Error(`Unexpected dependency: ${name}`);
    return require(name);
  }, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const access = load('lib/access.ts');
const auditor = { id: 15, authUserId: 'test-auditor', email: 'auditor@embrapii.org.br', role: 'auditor', active: true };

test('report selection controls preview and Excel; overview charts require explicit selection', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const key of ['indicators', 'prospectedCompanies', 'contractedProjects', 'openNegotiations']) {
    for (const charts of [false, true]) {
      let index = 0, exported;
      const sections = Object.fromEntries(['indicators', 'prospectedCompanies', 'contractedProjects', 'openNegotiations'].map(name => [name, name === key]));
      const states = [{ start: '2026-01-01', end: '2026-12-31' }, 'year', sections, [1, 2], charts];
      const stop = new Error('captured');
      const { Reports, fallback } = load('app/crm-app.tsx', {
        react: { ...React, useMemo: fn => fn(), useState: () => [states[index++], () => {}] },
        '../lib/access': access, '../lib/supabase/client': {},
        '../lib/excel-export': { createConfigurableReportExcel: value => { exported = value; throw stop; } },
      }, '\nexport { Reports, fallback };');
      const data = { ...fallback, kpis: fallback.kpis.slice(0, 3) };
      const tree = Reports({ data, availableYears: [2026] });
      const html = renderToStaticMarkup(tree);
      const output = html.slice(html.indexOf('<article class="report-output">'));
      assert.equal(output.includes('report-chart-grid'), charts);
      for (const [name, title] of [['indicators', 'Indicadores'], ['prospectedCompanies', 'Empresas prospectadas'], ['contractedProjects', 'Projetos contratados'], ['openNegotiations', 'Negociações em aberto e aceitas']]) {
        assert.equal(output.includes('<h3>' + title + '</h3>'), sections[name]);
      }
      if (key === 'indicators') assert.match(output, /1 selecionados/);
      const findExport = node => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'button' && node.props.children === 'Exportar Excel') return node;
        return React.Children.toArray(node.props?.children).map(findExport).find(Boolean);
      };
      assert.throws(() => findExport(tree).props.onClick(), error => error === stop);
      assert.equal(exported.length, 1);
      if (key === 'indicators') { assert.equal(exported[0].rows.length, 1); assert.equal(exported[0].rows[0].indicator, data.kpis[2].label); }
    }
  }
});

test('invitation handler installs implicit tokens instead of relying on the PKCE client', async () => {
  const { acceptCrmInvitation } = load('lib/invitation.ts');
  const calls = [];
  const client = { auth: Object.fromEntries(['setSession', 'exchangeCodeForSession', 'verifyOtp', 'getSession'].map(name => [name, async value => { calls.push([name, value]); return { data: { session: {} }, error: null }; }])) };
  await acceptCrmInvitation(client, new URL('https://crm.example/auth/convite#access_token=test-token&refresh_token=test-refresh&type=invite'));
  assert.deepEqual(calls.pop(), ['setSession', { access_token: 'test-token', refresh_token: 'test-refresh' }]);
  await acceptCrmInvitation(client, new URL('https://crm.example/auth/convite?code=test-code'));
  assert.deepEqual(calls.pop(), ['exchangeCodeForSession', 'test-code']);
  await acceptCrmInvitation(client, new URL('https://crm.example/auth/convite?token_hash=test-hash'));
  assert.deepEqual(calls.pop(), ['verifyOtp', { token_hash: 'test-hash', type: 'invite' }]);
  await assert.rejects(() => acceptCrmInvitation(client, new URL('https://crm.example/auth/convite#error=access_denied')));
  assert.equal(calls.length, 0);
});

test('external profiles are restricted to auditor; inactive and unlinked profiles are denied', () => {
  assert.equal(access.isAllowedProfileEmail(auditor.email, 'auditor'), true);
  for (const role of ['admin', 'user']) assert.equal(access.isAllowedProfileEmail(auditor.email, role), false);
  assert.equal(access.isAllowedProfileEmail('invalid', 'auditor'), false);
  const user = { id: auditor.authUserId, email: auditor.email };
  assert.equal(access.hasCrmAccess(auditor, user), true);
  for (const change of [{ active: false }, { role: 'owner' }, { role: 'admin' }, { authUserId: 'another' }, { email: 'other@embrapii.org.br' }]) {
    assert.equal(access.hasCrmAccess({ ...auditor, ...change }, user), false);
  }
  assert.equal(access.hasCrmAccess({ ...auditor, email: 'member@ctnano.org', role: 'user' }, { id: auditor.authUserId, email: 'member@ctnano.org' }), true);
});

test('CRM API denies every auditor mutation before reading the body or accessing the database', async () => {
  const route = load('app/api/crm/route.ts', {
    '../../../lib/access': access,
    '../../../lib/auth': { requireCrmApiUser: async () => ({ user: auditor, response: null }), requireAdmin: user => user.role === 'admin' },
    '../../../lib/supabase/admin': { createAdminClient: () => { throw new Error('Auditor accessed privileged database'); } },
    '../../../db/crm': { getSnapshot: async () => ({ companies: [], kpis: [] }) },
  });
  for (const entity of ['users', 'companies', 'contacts', 'opportunities', 'activities', 'projects', 'kpis']) {
    for (const action of ['create', 'update', 'delete']) {
      const response = await route.POST(new Request('https://crm.example/api/crm', { method: 'POST', body: JSON.stringify({ entity, action, data: { id: 1 } }) }));
      assert.equal(response.status, 403, `${entity}/${action}`);
    }
  }
  assert.equal((await route.POST({ json() { throw new Error('Body parsed before authorization'); } })).status, 403);
  const read = await route.GET();
  assert.equal(read.status, 200);
  assert.equal(read.headers.get('cache-control'), 'private, no-store');
});

test('import, backup, and integral export reject auditors; regular Excel export remains readable', async () => {
  const mocks = {
    '../../../lib/auth': { requireCrmApiUser: async () => ({ user: auditor, response: null }), requireAdmin: user => user.role === 'admin' },
    '../../../lib/supabase/admin': { createAdminClient: () => { throw new Error('Privileged write attempted'); } },
    '../../../db/crm': { getSnapshot: async () => ({ companies: [], kpis: [] }) },
    '../../../lib/excel-export': { createCrmExcel: () => new Uint8Array([1, 2, 3]) },
  };
  for (const name of ['import', 'backup']) assert.equal((await load(`app/api/${name}/route.ts`, mocks).POST()).status, 403);
  assert.equal((await load('app/api/export/route.ts', mocks).GET()).status, 403);
  assert.equal((await load('app/api/export-excel/route.ts', mocks).GET()).status, 200);
});

test('existing sessions use the current active flag on every request', async () => {
  let active = true;
  const auth = load('lib/auth.ts', {
    './access': access,
    'next/navigation': { redirect: () => { throw new Error('redirect'); } },
    './supabase/server': { createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: auditor.authUserId, email: auditor.email } } }) } }) },
    './supabase/admin': { createAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 15, auth_user_id: auditor.authUserId, full_name: 'Auditor', email: auditor.email, role: 'auditor', active } }) }) }) }) }) },
  });
  assert.equal((await auth.getCrmSessionUser()).role, 'auditor');
  active = false;
  assert.equal(await auth.getCrmSessionUser(), null);
  assert.equal((await auth.requireCrmApiUser()).response.status, 401);
  active = true;
  assert.equal((await auth.getCrmSessionUser()).role, 'auditor');
});

test('only an administrator can reserve an external auditor before sending the invitation', async () => {
  let callerRole = 'admin';
  let invitationFails = false;
  const events = [];
  const route = load('app/api/crm/route.ts', {
    '../../../lib/access': access,
    '../../../lib/auth': { requireCrmApiUser: async () => ({ user: { ...auditor, id: 1, role: callerRole }, response: null }), requireAdmin: user => user.role === 'admin' },
    '../../../db/crm': { getSnapshot: async () => ({ users: [] }) },
    '../../../lib/supabase/admin': { createAdminClient: () => ({
      from: () => ({
        insert: values => { events.push(['reserve', values]); return { select: () => ({ single: async () => ({ data: { id: 99 }, error: null }) }) }; },
        delete: () => { events.push(['cleanup']); return { eq: () => ({ is: async () => ({ error: null }) }) }; },
      }),
      auth: { admin: { inviteUserByEmail: async email => { events.push(['invite', email]); return invitationFails ? { data: {}, error: { message: 'SMTP failure' } } : { data: { user: { id: 'created-auth-user' } }, error: null }; } } },
    }) },
  });
  const request = (role = 'auditor') => new Request('https://crm.example/api/crm', { method: 'POST', body: JSON.stringify({ action: 'create', entity: 'users', data: { fullName: 'Auditor', email: auditor.email, phone: '', role, active: false } }) });
  assert.equal((await route.POST(request())).status, 200);
  assert.deepEqual(events.map(event => event[0]), ['reserve', 'invite']);
  assert.equal(events[0][1].role, 'auditor');
  assert.equal(events[0][1].active, false);
  events.length = 0;
  assert.equal((await route.POST(request('user'))).status, 400);
  assert.equal(events.length, 0);
  callerRole = 'user';
  assert.equal((await route.POST(request())).status, 403);
  assert.equal(events.length, 0);
  callerRole = 'admin'; invitationFails = true;
  assert.equal((await route.POST(request())).status, 400);
  assert.deepEqual(events.map(event => event[0]), ['reserve', 'invite', 'cleanup']);
});

test('auditor record dialogs disable fields and omit save/delete actions', () => {
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { RecordModal } = load('app/crm-app.tsx', {
    '../lib/access': access,
    '../lib/supabase/client': {},
    '../lib/excel-export': {},
  }, '\nexport { RecordModal };');
  const snapshot = { users: [], companies: [], opportunities: [], insights: { averageContractingDays: null } };
  const html = renderToStaticMarkup(React.createElement(RecordModal, {
    modal: { entity: 'companies', record: { id: 1, tradeName: 'Organização auditada' } }, snapshot, close() {}, save() {}, remove() {}, canDelete: false, readOnly: true,
  }));
  assert.match(html, /Somente visualização/);
  assert.match(html, /<fieldset disabled=""/);
  assert.doesNotMatch(html, /Salvar registro|Excluir registro/);
  const adminHtml = renderToStaticMarkup(React.createElement(RecordModal, {
    modal: { entity: 'users' }, snapshot, close() {}, save() {}, remove() {}, canDelete: true, readOnly: false,
  }));
  assert.match(adminHtml, /value="auditor"/);
  assert.match(adminHtml, /Acesso ativo/);
});
