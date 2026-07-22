-- Adiciona o campo opcional "Denunciante" aos casos.
-- Use para casos cuja origem seja "Denúncia".
alter table public.casos add column if not exists denunciante text;
