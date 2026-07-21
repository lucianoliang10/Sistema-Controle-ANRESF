-- Adiciona o campo "Responsável" às etapas.
-- Objetivo: uma etapa "Pendente ANRESF" pode receber um responsável direto
-- (sem precisar criar uma tarefa só para ela aparecer em Prazos críticos).
-- Execute este script manualmente no SQL Editor do Supabase.

alter table public.etapas add column if not exists responsavel text;

-- IMPORTANTE: a view v_data_fluxograma precisa expor a nova coluna para que
-- o site consiga ler e exibir o Responsável. Como a definição da view foi
-- criada direto no Supabase, edite-a lá (Database > Views > v_data_fluxograma)
-- e inclua a coluna no SELECT, por exemplo:
--
--   ..., e.responsavel, ...
--
-- Se a view usa "select *" da tabela etapas, nenhuma alteração é necessária —
-- basta rodar o ALTER TABLE acima e recriar a view (create or replace) para
-- que o novo campo apareça.
