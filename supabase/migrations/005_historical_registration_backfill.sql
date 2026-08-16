-- Define uma linha de base estimada para os registros históricos dos dois
-- indicadores de tempo de cadastro. Os timestamps originais ficam preservados
-- em um esquema privado para auditoria e eventual reversão.

begin;

set local statement_timeout = '30s';

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

create table if not exists private.crm_data_migration_runs (
  migration_key text primary key,
  cutoff_at timestamptz not null,
  executed_at timestamptz not null default now()
);

create table if not exists private.registration_created_at_backup (
  migration_key text not null references private.crm_data_migration_runs(migration_key) on delete restrict,
  entity text not null check (entity in ('contacts', 'opportunities')),
  record_id bigint not null,
  original_created_at timestamptz not null,
  adjusted_created_at timestamptz not null,
  backed_up_at timestamptz not null default now(),
  primary key (migration_key, entity, record_id)
);

revoke all on table private.crm_data_migration_runs from public, anon, authenticated;
revoke all on table private.registration_created_at_backup from public, anon, authenticated;

insert into private.crm_data_migration_runs (migration_key, cutoff_at)
values ('005_historical_registration_backfill', now())
on conflict (migration_key) do nothing;

with boundary as (
  select cutoff_at
  from private.crm_data_migration_runs
  where migration_key = '005_historical_registration_backfill'
)
insert into private.registration_created_at_backup (
  migration_key,
  entity,
  record_id,
  original_created_at,
  adjusted_created_at
)
select
  '005_historical_registration_backfill',
  'contacts',
  contacts.id,
  contacts.created_at,
  contacts.prospecting_date::timestamptz + interval '2 days'
from public.contacts
cross join boundary
where contacts.prospecting_date is not null
  and contacts.created_at <= boundary.cutoff_at
on conflict (migration_key, entity, record_id) do nothing;

with boundary as (
  select cutoff_at
  from private.crm_data_migration_runs
  where migration_key = '005_historical_registration_backfill'
)
insert into private.registration_created_at_backup (
  migration_key,
  entity,
  record_id,
  original_created_at,
  adjusted_created_at
)
select
  '005_historical_registration_backfill',
  'opportunities',
  opportunities.id,
  opportunities.created_at,
  opportunities.sent_date::timestamptz + interval '2 days'
from public.opportunities
cross join boundary
where opportunities.sent_date is not null
  and opportunities.created_at <= boundary.cutoff_at
on conflict (migration_key, entity, record_id) do nothing;

update public.contacts
set created_at = backup.adjusted_created_at
from private.registration_created_at_backup as backup
where backup.migration_key = '005_historical_registration_backfill'
  and backup.entity = 'contacts'
  and backup.record_id = contacts.id
  and contacts.created_at is distinct from backup.adjusted_created_at;

update public.opportunities
set created_at = backup.adjusted_created_at
from private.registration_created_at_backup as backup
where backup.migration_key = '005_historical_registration_backfill'
  and backup.entity = 'opportunities'
  and backup.record_id = opportunities.id
  and opportunities.created_at is distinct from backup.adjusted_created_at;

-- Define a meta de até 2 dias para 2026–2030 somente quando o administrador
-- ainda não tiver configurado metas para esses indicadores.
update public.kpis
set
  targets = '[{"year":2026,"target":2,"manualActual":0},{"year":2027,"target":2,"manualActual":0},{"year":2028,"target":2,"manualActual":0},{"year":2029,"target":2,"manualActual":0},{"year":2030,"target":2,"manualActual":0}]'::jsonb,
  target_2026 = 2,
  target_2027 = 2,
  target_2028 = 2
where key in (
  'average_opportunity_registration_time',
  'average_prospecting_registration_time'
)
  and targets = '[]'::jsonb;

commit;
