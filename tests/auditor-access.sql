-- Run against a migrated database. All test accounts and changes are rolled back.
begin;
do $$
declare
  auditor_id uuid := gen_random_uuid();
  disabled_id uuid := gen_random_uuid();
  internal_id uuid := gen_random_uuid();
begin
  insert into public.crm_users (id, full_name, email, role, active) values
    (-900001, 'Auditor permission test', 'ctnano-access-test@audit.invalid', 'auditor', true),
    (-900002, 'Disabled invitation test', 'ctnano-disabled-test@audit.invalid', 'auditor', false);
  insert into auth.users (id, email, raw_user_meta_data) values
    (auditor_id, 'ctnano-access-test@audit.invalid', '{"role":"admin","active":true}'),
    (disabled_id, 'ctnano-disabled-test@audit.invalid', '{"role":"admin","active":true}'),
    (internal_id, 'ctnano-internal-test@ctnano.org', '{"role":"admin"}');
  if not exists (select 1 from public.crm_users where auth_user_id=auditor_id and role='auditor' and active) then
    raise exception 'Auditor profile was not linked or metadata escalated its role';
  end if;
  if not exists (select 1 from public.crm_users where auth_user_id=disabled_id and role='auditor' and not active) then
    raise exception 'Accepting an invitation reactivated a disabled auditor';
  end if;
  if not exists (select 1 from public.crm_users where auth_user_id=internal_id and role='user') then
    raise exception 'Public signup metadata escalated the internal role';
  end if;
  begin
    insert into auth.users (id,email,raw_user_meta_data) values (gen_random_uuid(),'ctnano-unapproved-test@audit.invalid','{"role":"auditor"}');
    raise exception 'Unapproved external signup was allowed' using errcode='P0002';
  exception when raise_exception then null;
  end;
  begin
    update public.crm_users set role='admin' where id=-900001;
    raise exception 'External auditor could become admin' using errcode='P0002';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claim.sub', auditor_id::text, true);
end;
$$;

set local role authenticated;
do $$
declare
  tbl text;
  operation text;
begin
  if not private.is_active_ctnano_user() then raise exception 'Active auditor cannot read'; end if;
  if (select count(*) from public.kpis)=0 then raise exception 'Active auditor cannot see indicators'; end if;
  foreach tbl in array array['crm_users','companies','contacts','opportunities','activities','projects','kpis','backups'] loop
    foreach operation in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
      if has_table_privilege(current_user, 'public.' || tbl, operation) then
        raise exception 'Client role has % privilege on %',operation,tbl;
      end if;
    end loop;
    begin
      execute format('update public.%I set id=id where false', tbl);
      raise exception 'Write bypass on %',tbl using errcode='P0002';
    exception when insufficient_privilege then null;
    end;
  end loop;
end;
$$;

reset role;
update public.crm_users set active=false where id=-900001;
set local role authenticated;
do $$
begin
  if private.is_active_ctnano_user() then raise exception 'Disabled existing session is still active'; end if;
  if (select count(*) from public.kpis)<>0 then raise exception 'Disabled auditor can still read'; end if;
end;
$$;
reset role;
update public.crm_users set active=true where id=-900001;
set local role authenticated;
do $$
begin
  if not private.is_active_ctnano_user() then raise exception 'Reactivated auditor cannot read'; end if;
end;
$$;
reset role;
rollback;
select 'PASS: invitation linking, disabled invitation, metadata rejection, external signup rejection, external role constraint, active reads, 32 denied write privileges, existing-session deactivation and reactivation; test accounts rolled back' as result;
