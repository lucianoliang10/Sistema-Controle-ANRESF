-- Estrutura de tarefas dentro de uma etapa do fluxograma.
-- Execute este script manualmente no SQL Editor do Supabase (não há
-- ferramenta de migração automática neste projeto).

create table if not exists public.tarefas (
  id bigint generated always as identity primary key,
  etapa_id bigint not null references public.etapas(id) on delete cascade,
  data_inicial date,
  data_final date,
  observacao text,
  responsavel text,
  anexo_url text,
  anexo_nome text,
  conclusao text,
  status_tarefa text not null default 'Pendente' check (status_tarefa in ('Pendente', 'Concluída')),
  created_at timestamptz not null default now()
);

create index if not exists idx_tarefas_etapa_id on public.tarefas(etapa_id);
create index if not exists idx_tarefas_data_final on public.tarefas(data_final);

alter table public.tarefas add column if not exists anexo_url text;
alter table public.tarefas add column if not exists anexo_nome text;
alter table public.tarefas add column if not exists conclusao text;

-- View usada pela API para listar tarefas já com os dados da etapa/caso.
create or replace view public.v_tarefas as
select
  t.id,
  t.etapa_id,
  t.data_inicial,
  t.data_final,
  t.observacao,
  t.responsavel,
  t.anexo_url,
  t.anexo_nome,
  t.conclusao,
  t.status_tarefa,
  t.created_at,
  e.nome_etapa,
  e.ramo,
  e.status_etapa,
  e.caso_id,
  c.numero_caso,
  c.clube,
  c.origem,
  c.serie
from public.tarefas t
join public.etapas e on e.id = t.etapa_id
join public.casos c on c.id = e.caso_id;

-- Caso Row Level Security esteja habilitado no schema public, a API usa a
-- service role key (que ignora RLS), então nenhuma policy adicional é
-- necessária. Se preferir habilitar RLS por padrão neste schema, crie uma
-- policy liberando o service role antes de ativar:
-- alter table public.tarefas enable row level security;
-- create policy "tarefas_service_role_all" on public.tarefas for all using (true) with check (true);
