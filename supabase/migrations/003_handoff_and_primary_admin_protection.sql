-- Atualiza a terminologia exibida sem renomear a coluna técnica
-- handover_progress, preservando compatibilidade com backups anteriores.
alter table public.projects
  alter column status set default 'Handoff';

update public.projects
set status = 'Handoff'
where lower(trim(status)) = 'handover';

create or replace function public.prevent_primary_crm_admin_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if lower(old.email) = 'ricardo.neres@ctnano.org' then
    raise exception 'O administrador principal do sistema não pode ser excluído';
  end if;
  return old;
end;
$$;

drop trigger if exists prevent_primary_crm_admin_delete_row on public.crm_users;
create trigger prevent_primary_crm_admin_delete_row
  before delete on public.crm_users
  for each row execute procedure public.prevent_primary_crm_admin_delete();
