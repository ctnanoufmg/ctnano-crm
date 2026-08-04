-- Execute esta migração uma vez no SQL Editor do Supabase antes de publicar o código.
-- Ela preserva todos os registros existentes.

alter table public.opportunities
  drop constraint if exists opportunity_contract_date_rule;

alter table public.opportunities
  add column if not exists project_code text not null default '';
