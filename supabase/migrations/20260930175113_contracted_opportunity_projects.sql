-- Relink an imported project only when the company/title identify one contracted opportunity.
with candidates as (
  select p.id as project_id, min(o.id) as opportunity_id
  from public.projects p
  join public.opportunities o on o.company_id=p.company_id
    and lower(trim(o.title))=lower(trim(p.name)) and o.stage='Contratada'
  left join public.opportunities current_origin on current_origin.id=p.opportunity_id
  where current_origin.stage is distinct from 'Contratada'
    and not exists (select 1 from public.projects linked where linked.opportunity_id=o.id and linked.id<>p.id)
  group by p.id having count(*)=1
)
update public.projects p set opportunity_id=c.opportunity_id
from candidates c where p.id=c.project_id;

create unique index projects_one_per_opportunity on public.projects(opportunity_id) where opportunity_id is not null;

create or replace function private.ensure_contracted_project()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.stage='Contratada' then
    insert into public.projects(opportunity_id,company_id,name,status,manager,responsible_user_id,total_value)
    values(new.id,new.company_id,new.title,'Handoff',coalesce(new.owner,''),new.responsible_user_id,new.total_value)
    on conflict (opportunity_id) where opportunity_id is not null do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.ensure_contracted_project() from public,anon,authenticated;
create trigger ensure_contracted_project after insert or update on public.opportunities
for each row execute function private.ensure_contracted_project();

insert into public.projects(opportunity_id,company_id,name,status,manager,responsible_user_id,total_value)
select id,company_id,title,'Handoff',coalesce(owner,''),responsible_user_id,total_value
from public.opportunities where stage='Contratada'
on conflict (opportunity_id) where opportunity_id is not null do nothing;
