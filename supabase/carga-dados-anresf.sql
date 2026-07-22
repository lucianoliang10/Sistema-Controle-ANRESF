-- ============================================================
-- Carga de dados ANRESF (casos + etapas + ramificações)
-- Gerado automaticamente. Rode UMA VEZ no SQL Editor do Supabase.
-- Para reverter esta carga, use o bloco comentado no final.
--
-- Regras de mapeamento aplicadas:
--   * Cada número de Caso (7..44) vira 1 registro em "casos".
--   * "8,1 / 9,1 / 10,1 / 11,1 / 16,1" NÃO são casos novos: são
--     ramificações do caso pai (coluna ramo = '1' + ramo_origem_id).
--   * Cada linha da planilha vira 1 etapa; "Data de entrega" -> data_entrega.
--   * "Turma" é derivada do objeto/etapa dos acórdãos (Turma 01/02/Presidência).
--
-- PRÉ-REQUISITOS / OBSERVAÇÕES:
--   * Assume que os casos 7..44 ainda NÃO existem. Se já existirem, rode
--     antes o bloco REVERTER (no final) para evitar duplicidade.
--   * Este script cria as colunas etapas.turma e etapas.data_entrega se
--     faltarem. Para que apareçam no site, a view v_data_fluxograma precisa
--     expô-las (recrie a view incluindo e.turma e e.data_entrega).
-- ============================================================

begin;

-- Garante as colunas opcionais usadas por esta carga (idempotente).
alter table public.etapas add column if not exists turma text;
alter table public.etapas add column if not exists data_entrega date;

with novos_casos as (
  insert into public.casos (numero_caso, origem, clube, serie, status_caso)
  values
    (7, 'DF 2026', 'Remo', 'A', 'Finalizado'),
    (8, 'DF 2026', 'São Bernardo', 'B', 'Finalizado'),
    (9, 'DF 2026', 'Londrina', 'B', 'Em andamento'),
    (10, 'DF 2026', 'Avaí', 'B', 'Em andamento'),
    (11, 'DF 2026', 'CRB', 'B', 'Em andamento'),
    (12, 'DF 2026', 'Ponte Preta', 'B', 'Finalizado'),
    (14, 'Solvência 2026/02/28', 'SAF Botafogo', 'A', 'Finalizado'),
    (15, 'Solvência 2026/02/28', 'São Bernardo', 'B', 'Finalizado'),
    (16, 'Monitoramento 2026', 'Avaí', 'B', 'Em andamento'),
    (17, 'Solvência 2026/02/28', 'Athletico PR', 'A', 'Em andamento'),
    (18, 'Solvência 2026/02/28', 'Atlético MG', 'A', 'Em andamento'),
    (19, 'Solvência 2026/02/28', 'SAF Botafogo', 'A', 'Em andamento'),
    (20, 'Solvência 2026/02/28', 'Corinthians', 'A', 'Em andamento'),
    (21, 'Solvência 2026/02/28', 'Fluminense', 'A', 'Em andamento'),
    (22, 'Solvência 2026/02/28', 'Gremio', 'A', 'Em andamento'),
    (23, 'Solvência 2026/02/28', 'Internacional', 'A', 'Em andamento'),
    (24, 'Solvência 2026/02/28', 'Palmeiras', 'A', 'Em andamento'),
    (25, 'Solvência 2026/02/28', 'Remo', 'A', 'Em andamento'),
    (26, 'Solvência 2026/02/28', 'Santos', 'A', 'Em andamento'),
    (27, 'Solvência 2026/02/28', 'São Paulo', 'A', 'Em andamento'),
    (28, 'Solvência 2026/02/28', 'Vitória', 'A', 'Em andamento'),
    (29, 'Solvência 2026/02/28', 'América MG', 'B', 'Em andamento'),
    (30, 'Solvência 2026/02/28', 'Atlético GO', 'B', 'Em andamento'),
    (31, 'Solvência 2026/02/28', 'Ceará', 'B', 'Em andamento'),
    (32, 'Solvência 2026/02/28', 'Criciúma', 'B', 'Em andamento'),
    (33, 'Solvência 2026/02/28', 'Cuiabá', 'B', 'Em andamento'),
    (34, 'Solvência 2026/02/28', 'Fortaleza', 'B', 'Em andamento'),
    (35, 'Solvência 2026/02/28', 'Londrina', 'B', 'Em andamento'),
    (36, 'Solvência 2026/02/28', 'Náutico', 'B', 'Em andamento'),
    (37, 'Solvência 2026/02/28', 'Sport Recife', 'B', 'Em andamento'),
    (38, 'Solvência 2026/02/28', 'São Bernardo', 'B', 'Em andamento'),
    (39, 'Solvência 2026/02/28', 'Vila Nova', 'B', 'Em andamento'),
    (40, 'Solvência 2026/02/28', 'Ponte Preta', 'B', 'Em andamento'),
    (41, 'Solvência 2026/02/28', 'Avaí', 'B', 'Em andamento'),
    (42, 'Denúncia 2026', 'Náutico', 'B', 'Finalizado'),
    (43, 'Denúncia 2026', 'Sport Recife', 'B', 'Em andamento'),
    (44, 'Denúncia 2026', 'América MG', 'B', 'Em andamento')
  returning id, numero_caso
)
insert into public.etapas
  (caso_id, ramo, id_etapa, nome_etapa, ordem, objeto, data_etapa, prazo, data_entrega, observacao, sancao, turma, status_etapa)
select nc.id, v.ramo, v.id_etapa, v.nome_etapa, v.ordem, v.objeto,
       v.data_etapa, v.prazo, v.data_entrega, v.observacao, v.sancao, v.turma, v.status_etapa
from (values
    (7, '', '007/2026', 'Auto de Infração - PSS', 1, 'Descumprimento do dever de publicação das DFs', date '2026-05-15', date '2026-05-20', date '2026-05-20', 'O Clube apresentou defesa e DF publicada', 'Advertência + Multa 40k', null, 'Finalizado'),
    (7, '', '007/2026', 'Acórdão - PSS', 2, 'Avaliação pela Turma de Julgamento 01', date '2026-06-05', date '2026-06-05', null, 'Turma 01 - Decidido advertência por não publicação das DFs', 'Advertência', 'Turma 01', 'Finalizado'),
    (7, '', null, 'Acompanhamento', 3, '5 dias úties para reconsideração', date '2026-06-05', date '2026-06-12', null, 'Não houve pedido de reconsideração', null, null, 'Finalizado'),
    (8, '', '008/2026', 'Auto de Infração - PSS', 1, 'Descumprimento do dever de publicação das DFs', date '2026-05-15', date '2026-05-20', date '2026-05-20', 'O Clube apresentou defesa', 'Advertência + Multa 20k', null, 'Finalizado'),
    (8, '', '008/2026', 'Acórdão - PSS', 2, 'Avaliação pela Turma de Julgamento 01', date '2026-06-05', date '2026-06-05', null, 'Turma 01 - Decidido advertência por não publicação das DFs + Prazo para publicação', 'Advertência', 'Turma 01', 'Finalizado'),
    (8, '', null, 'Acompanhamento', 3, '5 dias úties para reconsideração', date '2026-06-05', date '2026-06-12', null, 'Não houve pedido de reconsideração', null, null, 'Finalizado'),
    (8, '1', null, 'Acompanhamento', 1, 'Acompanhar publicação das DFs', date '2026-06-05', date '2026-07-17', null, 'Clube comprovou a publicação das DFs', null, null, 'Finalizado'),
    (9, '', '009/2026', 'Auto de Infração - PSS', 1, 'Descumprimento do dever de publicação das DFs', date '2026-05-15', date '2026-05-20', date '2026-05-20', 'O Clube apresentou defesa', 'Advertência + Multa 20k', null, 'Finalizado'),
    (9, '', '009/2026', 'Acórdão - PSS', 2, 'Avaliação pela Turma de Julgamento 01', date '2026-06-05', date '2026-06-05', null, 'Turma 01 - Decidido advertência por não publicação das DFs + Prazo para publicação', 'Advertência', 'Turma 01', 'Finalizado'),
    (9, '', null, 'Acompanhamento', 3, '5 dias úties para reconsideração', date '2026-06-05', date '2026-06-12', date '2026-06-12', 'Pedido de reconsideração por parte do Clube', null, null, 'Finalizado'),
    (9, '', null, 'Acompanhamento', 4, 'Avaliaçao do Pedido de reconsideração do Acórdão 009/2026', date '2026-06-12', date '2026-06-19', null, null, null, null, 'Pendente ANRESF'),
    (9, '1', null, 'Acompanhamento', 1, 'Acompanhar publicação das DFs', date '2026-06-05', date '2026-07-17', null, 'Acompanhar publicação das DFs', null, null, 'Finalizado'),
    (9, '1', null, 'Acompanhamento', 2, 'DF Publicada', date '2026-06-12', date '2026-06-12', date '2026-06-12', 'DF Publicada', null, null, 'Finalizado'),
    (10, '', '010/2026', 'Auto de Infração - PSS', 1, 'Descumprimento do dever de publicação das DFs', date '2026-05-15', date '2026-05-20', date '2026-05-20', 'O Clube apresentou defesa', 'Advertência + Multa 20k', null, 'Finalizado'),
    (10, '', '010/2026', 'Acórdão - PSS', 2, 'Avaliação pela Turma de Julgamento 01', date '2026-06-05', date '2026-06-05', null, 'Turma 01 - Decidido advertência por não publicação das DFs + Prazo para publicação', 'Advertência', 'Turma 01', 'Finalizado'),
    (10, '', null, 'Acompanhamento', 3, '5 dias úties para reconsideração', date '2026-06-05', date '2026-06-12', null, 'Acompanhar possível reconsideração', null, null, 'Finalizado'),
    (10, '1', null, 'Acompanhamento', 1, 'Acompanhar publicação das DFs', date '2026-06-05', date '2026-07-07', null, 'Clube não publicou a DF e solicitou dilação do prazo', null, null, 'Finalizado'),
    (10, '1', null, 'Acompanhamento', 2, 'Avaliação do Pedido de dilação', date '2026-07-07', date '2026-07-15', null, null, null, null, 'Pendente ANRESF'),
    (11, '', '011/2026', 'Auto de Infração - PSS', 1, 'Descumprimento do dever de publicação das DFs', date '2026-05-15', date '2026-05-20', date '2026-05-20', 'O Clube apresentou defesa', 'Advertência + Multa 20k', null, 'Finalizado'),
    (11, '', '011/2026', 'Acórdão - PSS', 2, 'Avaliação pela Turma de Julgamento 01', date '2026-06-05', date '2026-06-05', null, 'Turma 01 - Decidido advertência por não publicação das DFs + Prazo para publicação', 'Advertência', 'Turma 01', 'Finalizado'),
    (11, '', null, 'Acompanhamento', 3, '5 dias úties para reconsideração', date '2026-06-05', date '2026-06-12', null, 'Não houve pedido de reconsideração', null, null, 'Finalizado'),
    (11, '1', null, 'Acompanhamento', 1, 'Acompanhar publicação das DFs', date '2026-06-05', date '2026-09-06', null, 'Acompanhar publicação das DFs', null, null, 'Pendente Clube'),
    (12, '', '012/2026', 'Auto de Infração - PSS', 1, 'Descumprimento do dever de publicação das DFs', date '2026-05-15', date '2026-05-20', date '2026-05-20', 'O Clube apresentou defesa e DF publicada', 'Advertência + Multa 20k', null, 'Finalizado'),
    (12, '', '012/2026', 'Acórdão - PSS', 2, 'Avaliação pela Turma de Julgamento 01', date '2026-06-05', date '2026-06-05', null, 'Turma 01 - Decidido advertência por não publicação das DFs', 'Advertência', 'Turma 01', 'Finalizado'),
    (12, '', null, 'Acompanhamento', 3, '5 dias úties para reconsideração', date '2026-06-05', date '2026-06-12', null, 'Não houve pedido de reconsideração', null, null, 'Finalizado'),
    (14, '', '015/2026', 'Auto de Infração - PSS', 1, 'Não reporte do Requisito de Solvência', date '2026-05-15', date '2026-05-20', date '2026-05-20', 'O Clube apresentou defesa', 'Advertência + Multa 100k + 20k por dia', null, 'Finalizado'),
    (14, '', '015/2026', 'Acórdão - PSS', 2, 'Avaliação pela Turma de Julgamento 02', date '2026-06-03', date '2026-06-03', null, 'Turma 02 - Decidido advertência por não reporte da Solvência', 'Advertência', 'Turma 02', 'Finalizado'),
    (15, '', '016/2026', 'Auto de Infração - PSS', 1, 'Não reporte do Requisito de Solvência', date '2026-05-15', date '2026-05-20', date '2026-05-20', 'O Clube apresentou defesa', 'Advertência + Multa 50k + 10k por dia', null, 'Finalizado'),
    (15, '', '016/2026', 'Acórdão - PSS', 2, 'Avaliação pela Turma de Julgamento 02', date '2026-06-03', date '2026-06-03', null, 'Turma 02 - Decidido advertência por não reporte da Solvência', 'Advertência', 'Turma 02', 'Finalizado'),
    (16, '', '003/2026', 'Diligência', 1, 'Acompanhar envio de documentos', date '2026-05-28', date '2026-05-26', null, 'O Clube não enviou os documentos e foi aberto um auto de infração', null, null, 'Finalizado'),
    (16, '1', '014/2026', 'Auto de Infração - PSS', 1, 'Pelo não envio de documentação', date '2026-06-03', date '2026-06-09', date '2026-06-09', 'Defesa apresentada e documentos entregues', 'Advertência + Multa 50k + 10k por dia', null, 'Finalizado'),
    (16, '1', '014/2026', 'Acórdão - PSS', 2, 'Avaliação pela Turma de Julgamento 02', date '2026-06-09', date '2026-07-08', null, 'Aguardando decisão', null, 'Turma 02', 'Pendente ANRESF'),
    (17, '', '018/2026', 'Auto de Infração - PSS', 1, 'Descumprimento do Requisito de Solvência (Pré 2026)', date '2026-06-02', date '2026-06-08', date '2026-06-05', 'O Clube apresentou defesa', 'Advertência', null, 'Finalizado'),
    (17, '', '001/2026', 'Acórdão Decisão da Presidência - PSS', 2, 'Avaliação pela Presidência', date '2026-06-08', date '2026-07-08', null, 'Presidência - Decidido assegurar prazo de defesa de 10 dias úteis', 'Sem sanção', 'Presidência', 'Finalizado'),
    (18, '', '019/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: Tributárias)', date '2026-06-02', date '2026-06-17', null, 'O Clube apresentou defesa', 'Advertência + Não regularização acarretará nova Infração', null, 'Finalizado'),
    (18, '', '005/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-06-17', date '2026-07-02', date '2026-07-02', 'Documentação enviada para avaliação da Turma 02', null, null, 'Finalizado'),
    (18, '', '019/2026', 'Acórdão - PSO', 3, 'Avaliação pela Turma de Julgamento 02', date '2026-07-02', date '2026-07-08', null, 'Aguardando decisão', null, 'Turma 02', 'Pendente ANRESF'),
    (19, '', '020/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: (i) Pessoas Relevantes + (ii) Tributárias )', date '2026-06-02', date '2026-06-17', date '2026-06-17', 'O Clube apresentou defesa', 'Advertência + (i) Multa 100k + (ii) Não regularização acarretará nova Infração', null, 'Finalizado'),
    (19, '', '006/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-06-17', date '2026-07-02', date '2026-07-02', 'Documentação enviada para avaliação da Turma 02', null, null, 'Finalizado'),
    (19, '', '020/2026', 'Acórdão - PSO', 3, 'Avaliação pela Turma de Julgamento 02', date '2026-07-02', date '2026-07-08', null, 'Aguardando decisão', null, 'Turma 02', 'Pendente ANRESF'),
    (20, '', '021/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: Tributárias)', date '2026-06-02', date '2026-06-17', date '2026-06-17', 'O Clube apresentou defesa', 'Advertência + Não regularização acarretará nova Infração', null, 'Finalizado'),
    (20, '', '007/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-06-17', date '2026-07-02', date '2026-07-02', 'Documentação enviada para avaliação da Turma 02', null, null, 'Finalizado'),
    (20, '', '021/2026', 'Acórdão - PSO', 3, 'Avaliação pela Turma de Julgamento 02', date '2026-07-02', date '2026-07-08', null, 'Aguardando decisão', null, 'Turma 02', 'Pendente ANRESF'),
    (21, '', '022/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: Tributárias)', date '2026-06-02', date '2026-06-17', date '2026-06-16', 'O Clube apresentou defesa', 'Advertência + Não regularização acarretará nova Infração', null, 'Finalizado'),
    (21, '', '008/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-06-17', date '2026-07-02', date '2026-07-02', 'Documentação enviada para avaliação da Turma 02', null, null, 'Finalizado'),
    (21, '', '022/2026', 'Acórdão - PSO', 3, 'Avaliação pela Turma de Julgamento 02', date '2026-07-02', date '2026-07-08', null, 'Aguardando decisão', null, 'Turma 02', 'Pendente ANRESF'),
    (22, '', '023/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: Tributárias)', date '2026-06-02', date '2026-06-17', date '2026-06-12', 'O Clube apresentou defesa', 'Advertência + Não regularização acarretará nova Infração', null, 'Finalizado'),
    (22, '', '009/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-06-17', date '2026-07-02', date '2026-07-02', 'Documentação enviada para avaliação da Turma 02', null, null, 'Finalizado'),
    (22, '', '023/2026', 'Acórdão - PSO', 3, 'Avaliação pela Turma de Julgamento 02', date '2026-07-02', date '2026-07-08', null, 'Aguardando decisão', null, 'Turma 02', 'Pendente ANRESF'),
    (23, '', '024/2026', 'Auto de Infração - PSS', 1, 'Descumprimento do Requisito de Solvência (Pré 2026)', date '2026-06-02', date '2026-06-08', date '2026-06-08', 'O Clube apresentou defesa', 'Advertência', null, 'Finalizado'),
    (23, '', '002/2026', 'Acórdão Decisão da Presidência - PSS', 2, 'Avaliação pela Presidência', date '2026-06-08', date '2026-07-08', null, 'Presidência - Decidido assegurar prazo de defesa de 10 dias úteis', 'Sem sanção', 'Presidência', 'Finalizado'),
    (24, '', '025/2026', 'Auto de Infração - PSS', 1, 'Descumprimento do Requisito de Solvência (Pré 2026)', date '2026-06-02', date '2026-06-08', date '2026-06-08', 'O Clube apresentou defesa', 'Advertência', null, 'Finalizado'),
    (24, '', '003/2026', 'Acórdão Decisão da Presidência - PSS', 2, 'Avaliação pela Presidência', date '2026-06-08', date '2026-07-08', null, 'Presidência - Decidido assegurar prazo de defesa de 10 dias úteis', 'Sem sanção', 'Presidência', 'Finalizado'),
    (25, '', '026/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: Tributárias)', date '2026-06-02', date '2026-06-17', date '2026-06-16', 'O Clube apresentou defesa', 'Advertência + Não regularização acarretará nova Infração', null, 'Finalizado'),
    (25, '', '010/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-06-17', date '2026-07-02', date '2026-07-02', 'Documentação enviada para avaliação da Turma 02', null, null, 'Finalizado'),
    (25, '', '024/2026', 'Acórdão - PSO', 3, 'Avaliação pela Turma de Julgamento 02', date '2026-07-02', date '2026-07-08', null, 'Aguardando decisão', null, 'Turma 02', 'Pendente ANRESF'),
    (26, '', '027/2026', 'Auto de Infração - PSS', 1, 'Descumprimento do Requisito de Solvência (Pré 2026)', date '2026-06-02', date '2026-06-08', date '2026-06-08', 'O Clube apresentou defesa', 'Advertência', null, 'Finalizado'),
    (26, '', '004/2026', 'Acórdão Decisão da Presidência - PSS', 2, 'Avaliação pela Presidência', date '2026-06-08', date '2026-07-08', null, 'Presidência - Decidido assegurar prazo de defesa de 10 dias úteis', 'Sem sanção', 'Presidência', 'Finalizado'),
    (27, '', '028/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: (i) Clubes + (ii) Pessoas Relevantes)', date '2026-06-02', date '2026-06-17', date '2026-06-08', 'O Clube apresentou defesa', 'Advertência + (i) Multa 100k + (ii) Multa 100k', null, 'Finalizado'),
    (27, '', '011/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-06-17', date '2026-07-02', date '2026-07-02', 'Documentação enviada para avaliação da Turma 02', null, null, 'Finalizado'),
    (27, '', '025/2026', 'Acórdão - PSO', 3, 'Avaliação pela Turma de Julgamento 02', date '2026-07-02', date '2026-07-08', null, 'Aguardando decisão', null, 'Turma 02', 'Pendente ANRESF'),
    (28, '', '029/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: Tributárias)', date '2026-06-02', date '2026-06-17', date '2026-06-17', 'O Clube apresentou defesa', 'Advertência + Não regularização acarretará nova Infração', null, 'Finalizado'),
    (28, '', '012/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-06-17', date '2026-07-02', date '2026-07-02', 'Documentação enviada para avaliação da Turma 02', null, null, 'Finalizado'),
    (28, '', '026/2026', 'Acórdão - PSO', 3, 'Avaliação pela Turma de Julgamento 02', date '2026-07-02', date '2026-07-08', null, 'Aguardando decisão', null, 'Turma 02', 'Pendente ANRESF'),
    (29, '', '030/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: (i) Pessoas Relevantes + (ii) Empregados + (iii) Tributárias)', date '2026-06-22', date '2026-07-06', date '2026-07-06', 'O Clube apresentou defesa', 'Advertência + (i) Exclusão PARF-B + (ii) Exclusão PARF-B + (iii) Não regularização acarretará nova Infração', null, 'Finalizado'),
    (29, '', '013/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-07-06', date '2026-07-20', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (30, '', '031/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: Tributárias)', date '2026-06-22', date '2026-07-06', null, 'O Clube apresentou defesa', 'Advertência + Não regularização acarretará nova Infração', null, 'Finalizado'),
    (30, '', '014/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-07-06', date '2026-07-20', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (31, '', '032/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: (i) Pessoas Relevantes + (ii) Outros Clubes+ (iii) Tributárias)', date '2026-06-22', date '2026-07-06', date '2026-07-06', 'O Clube apresentou defesa', 'Advertência + (i) Exclusão PARF-B + (ii) Exclusão PARF-B + (iii) Não regularização acarretará nova Infração', null, 'Finalizado'),
    (31, '', '015/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-07-06', date '2026-07-20', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (32, '', '033/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: Tributárias)', date '2026-06-22', date '2026-07-06', date '2026-07-06', 'O Clube apresentou defesa', 'Advertência + Não regularização acarretará nova Infração', null, 'Finalizado'),
    (32, '', '016/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-07-06', date '2026-07-20', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (33, '', '034/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026)', date '2026-06-23', date '2026-07-07', date '2026-06-25', 'O Clube apresentou defesa', 'Advertência', null, 'Finalizado'),
    (33, '', '017/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-06-25', date '2026-07-09', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (34, '', '035/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: (i) Pessoas Relevantes + (ii) Outros Clubes)', date '2026-06-22', date '2026-07-06', date '2026-07-06', 'O Clube apresentou defesa', 'Advertência + (i) Exclusão PARF-B + (ii) Exclusão PARF-B', null, 'Finalizado'),
    (34, '', '018/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-07-06', date '2026-07-20', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (35, '', '036/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026)', date '2026-06-22', date '2026-07-06', date '2026-07-03', 'O Clube apresentou defesa', 'Advertência', null, 'Finalizado'),
    (35, '', '019/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-07-03', date '2026-07-17', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (36, '', '037/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: Tributárias)', date '2026-06-22', date '2026-07-06', null, 'Não apresentou defesa', 'Advertência + Não regularização acarretará nova Infração', null, 'Finalizado'),
    (36, '', '020/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-07-06', date '2026-07-20', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (37, '', '038/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: Tributárias)', date '2026-06-22', date '2026-07-06', date '2026-07-03', 'O Clube apresentou defesa', 'Advertência + Não regularização acarretará nova Infração', null, 'Finalizado'),
    (37, '', '021/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-07-03', date '2026-07-17', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (38, '', '039/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pós 2026: Pessoas Relevantes)', date '2026-06-22', date '2026-07-06', null, 'Não apresentou defesa', 'Advertência + Exclusão PARF-B', null, 'Finalizado'),
    (38, '', '022/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-07-06', date '2026-07-20', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (39, '', '040/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026)', date '2026-06-23', date '2026-07-07', date '2026-06-26', 'O Clube apresentou defesa', 'Advertência', null, 'Finalizado'),
    (39, '', '023/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-06-26', date '2026-07-10', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (40, '', '041/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: (i) Pessoas Relevantes + (ii) Outros Clubes+ (iii) Tributárias + (iv) Empregados)', date '2026-06-22', date '2026-07-06', date '2026-07-06', 'O Clube apresentou defesa', 'Advertência + (i) Exclusão PARF-B + (ii) Exclusão PARF-B + (iii) Não regularização acarretará nova Infração + (iv) Exclusão PARF-B', null, 'Finalizado'),
    (40, '', '024/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-07-06', date '2026-07-20', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (41, '', '042/2026', 'Auto de Infração - PSO', 1, 'Descumprimento do Requisito de Solvência (Pré 2026 + Pós 2026: (i) Pessoas Relevantes + (ii) Outros Clubes+ (iii) Tributárias)', date '2026-06-23', date '2026-07-07', date '2026-07-07', 'O Clube apresentou defesa', 'Advertência + (i) Exclusão PARF-B + (ii) Exclusão PARF-B + (iii) Não regularização acarretará nova Infração', null, 'Finalizado'),
    (41, '', '025/2026', 'Parecer Técnico Conclusivo', 2, 'Elaboração de Parecer Técnico Conclusivo', date '2026-07-07', date '2026-07-21', null, 'Aguardando parecer', null, null, 'Pendente ANRESF'),
    (42, '', '003/2026', 'Parecer Técnico Conclusivo', 1, 'Elaboração de Parecer Técnico Conclusivo', date '2026-05-15', date '2026-06-16', null, 'Denúncia admitida - Inadimplemento por parte do Náutico', null, null, 'Finalizado'),
    (42, '', '001/2026', 'Denúncia', 2, 'Náutico intimado a enviar os comprovantes no prazo de 10 dias úteis', date '2026-06-16', date '2026-06-30', date '2026-06-19', 'Clube apresentou os comprovantes de pagamento', null, null, 'Finalizado'),
    (42, '', '018/2026', 'Acórdão Decisão da Presidência - PSS', 3, 'Avaliação pela Presidência', date '2026-06-19', date '2026-06-23', date '2026-06-23', 'Presidência - Decidido arquivamento do caso, por perda superveniente de objeto', 'Sem sanção', 'Presidência', 'Finalizado'),
    (43, '', '004/2026', 'Parecer Técnico Conclusivo', 1, 'Elaboração de Parecer Técnico Conclusivo', date '2026-06-09', date '2026-06-17', null, 'Denúncia admitida - Inadimplemento por parte do Sport Recife', null, null, 'Finalizado'),
    (43, '', '002/2026', 'Denúncia', 2, 'Sport Recife intimado a enviar os comprovantes no prazo de 10 dias úteis', date '2026-06-17', date '2026-07-01', date '2026-06-26', 'Defesa apresentada e documentos entregues', null, null, 'Finalizado'),
    (44, '', null, 'Parecer Técnico Conclusivo', 1, 'Elaboração de Parecer Técnico Conclusivo', date '2026-06-19', date '2026-06-24', null, 'Denúncia admitida - Inadimplemento por parte do América MG', null, null, 'Finalizado'),
    (44, '', '003/2026', 'Denúncia', 2, 'América MG intimado a enviar os comprovantes no prazo de 10 dias úteis', date '2026-06-24', date '2026-07-08', null, 'O Clube apresentou defesa', null, null, 'Finalizado')
) as v(numero_caso, ramo, id_etapa, nome_etapa, ordem, objeto, data_etapa, prazo, data_entrega, observacao, sancao, turma, status_etapa)
join novos_casos nc on nc.numero_caso = v.numero_caso;

-- Ramificações: liga a 1ª etapa de cada ramo à etapa de origem no fluxo principal.
-- 8.1 / 9.1 / 10.1 / 11.1: o Acompanhamento da ramificação nasce da 2ª etapa do fluxo
-- principal (o Acórdão - PSS). Casamos por ordem para evitar acentuação nos literais.
update public.etapas dest
set ramo_origem_id = orig.id
from public.etapas orig
where dest.caso_id = orig.caso_id
  and dest.ramo = '1' and dest.ordem = 1 and dest.nome_etapa = 'Acompanhamento'
  and orig.ramo = '' and orig.ordem = 2;

-- 16.1: a ramificação (Auto de Infração) nasce da 1ª etapa do fluxo principal (a Diligência).
-- Liga as ramificações ainda sem origem à 1ª etapa principal do mesmo caso.
update public.etapas dest
set ramo_origem_id = orig.id
from public.etapas orig
where dest.caso_id = orig.caso_id
  and dest.ramo = '1' and dest.ordem = 1 and dest.ramo_origem_id is null
  and orig.ramo = '' and orig.ordem = 1;

commit;

-- ------------------------------------------------------------
-- REVERTER (rode só se precisar desfazer esta carga):
-- delete from public.tarefas t using public.etapas e, public.casos c
--   where t.etapa_id = e.id and e.caso_id = c.id and c.numero_caso between 7 and 44;
-- delete from public.etapas e using public.casos c
--   where e.caso_id = c.id and c.numero_caso between 7 and 44;
-- delete from public.casos where numero_caso between 7 and 44;
