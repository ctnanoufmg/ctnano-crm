-- External accounts must be reserved by an administrator through the server.
-- Client roles have read access only; every CRM mutation goes through API guards.
alter table public.crm_users drop constraint crm_users_role_check;
alter table public.crm_users add constraint crm_users_role_check check (role in ('admin', 'user', 'auditor'));
alter table public.crm_users drop constraint crm_users_ctnano_email;
alter table public.crm_users add constraint crm_users_ctnano_email check (
  email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
  and (role = 'auditor' or lower(email) ~ '^[^@[:space:]]+@ctnano[.]org$')
);

create or replace function public.handle_new_crm_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  normalized_email text := lower(coalesce(new.email, ''));
  institutional boolean := normalized_email ~ '^[^@[:space:]]+@ctnano[.]org$';
begin
  -- User-editable metadata never grants access or determines the role.
  if not institutional then
    perform 1 from public.crm_users
    where lower(email) = normalized_email and role = 'auditor' and auth_user_id is null
    for update;
    if not found then
      raise exception 'Auditores externos devem ser cadastrados por um administrador';
    end if;
  end if;

  insert into public.crm_users (auth_user_id, full_name, email, phone, role, active)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(normalized_email, '@', 1)),
    normalized_email,
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    case when normalized_email = 'ricardo.neres@ctnano.org' then 'admin'
      when institutional then 'user' else 'auditor' end,
    true
  )
  on conflict (email) do update set
    auth_user_id = excluded.auth_user_id,
    full_name = case when public.crm_users.full_name = '' then excluded.full_name else public.crm_users.full_name end,
    phone = case when public.crm_users.phone = '' then excluded.phone else public.crm_users.phone end
  where public.crm_users.auth_user_id is null or public.crm_users.auth_user_id = new.id;
  if not found then
    raise exception 'Este e-mail já está vinculado a outra conta';
  end if;
  -- Existing role and active status are preserved, including disabled invitations.
  return new;
end;
$$;
revoke all on function public.handle_new_crm_user() from public, anon, authenticated;

-- Authorization lookup belongs outside the exposed API schema.
create schema if not exists private;
create or replace function private.is_active_ctnano_user()
returns boolean language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.crm_users where auth_user_id = auth.uid() and active
  );
$$;
revoke all on function private.is_active_ctnano_user() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_active_ctnano_user() to authenticated;
alter policy "active users read crm_users" on public.crm_users using (private.is_active_ctnano_user());
alter policy "active users read companies" on public.companies using (private.is_active_ctnano_user());
alter policy "active users read contacts" on public.contacts using (private.is_active_ctnano_user());
alter policy "active users read opportunities" on public.opportunities using (private.is_active_ctnano_user());
alter policy "active users read activities" on public.activities using (private.is_active_ctnano_user());
alter policy "active users read projects" on public.projects using (private.is_active_ctnano_user());
alter policy "active users read kpis" on public.kpis using (private.is_active_ctnano_user());
drop function public.is_active_ctnano_user();
alter function public.protect_primary_crm_admin() set search_path = '';

revoke all on table public.crm_users, public.companies, public.contacts, public.opportunities,
  public.activities, public.projects, public.kpis, public.backups from anon, authenticated;
grant select on table public.crm_users, public.companies, public.contacts, public.opportunities,
  public.activities, public.projects, public.kpis, public.backups to authenticated;

-- The existing SELECT policies check active against the live profile on every query.
-- No write policies are added for authenticated users, including auditors.
