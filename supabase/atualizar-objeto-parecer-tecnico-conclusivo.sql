-- Atualiza todas as etapas chamadas "Parecer Técnico Conclusivo" para o objeto padronizado.
update public.etapas
set objeto = 'Elaboração de Parecer Técnico Conclusivo'
where lower(trim(nome_etapa)) = lower('Parecer Técnico Conclusivo');
