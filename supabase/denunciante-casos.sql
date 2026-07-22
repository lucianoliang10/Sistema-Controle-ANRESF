-- Adiciona campos opcionais aos casos.
-- "Denunciante" é usado quando a origem do caso é "Denúncia".
-- "Período" é obrigatório no formulário da aplicação e aparece na busca/listagem de casos.
alter table public.casos add column if not exists denunciante text;
alter table public.casos add column if not exists periodo text;
