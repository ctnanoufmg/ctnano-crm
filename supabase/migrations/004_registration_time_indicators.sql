-- Adiciona os indicadores automáticos de tempo de cadastro sem alterar metas existentes.
insert into public.kpis (
  key,
  label,
  unit,
  direction,
  weight,
  measurement_method,
  show_on_dashboard,
  targets,
  target_2026,
  target_2027,
  target_2028,
  manual_actual_2026,
  manual_actual_2027,
  manual_actual_2028
)
values
  (
    'average_opportunity_registration_time',
    'Tempo médio de cadastro de oportunidades',
    'Outro',
    'Quanto menor, melhor',
    3,
    'Tempo médio entre envio da proposta e cadastro no CRM',
    false,
    '[]'::jsonb,
    0, 0, 0,
    0, 0, 0
  ),
  (
    'average_prospecting_registration_time',
    'Tempo médio de cadastro de prospecções',
    'Outro',
    'Quanto menor, melhor',
    3,
    'Tempo médio entre prospecção e cadastro no CRM',
    false,
    '[]'::jsonb,
    0, 0, 0,
    0, 0, 0
  )
on conflict (key) do nothing;
