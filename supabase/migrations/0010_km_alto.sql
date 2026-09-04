-- Km alto: para de barrar o técnico e passa a marcar para o gestor conferir.
-- Revise antes de aplicar: supabase db push (ou cole no SQL editor do Supabase).
--
-- O problema real, visto em produção duas vezes (TTP8H79 com 36.176 km e TTZ
-- com 16.238 km): o roteiro foi a Minas, rodou 1.827 km de verdade, e o app
-- recusou a chegada. O veículo ficou "na rua" no painel, o técnico não
-- conseguiu fechar, e o gestor teve que fechar por SQL. O teto de 600 km não
-- separava "digitou errado" de "viajou longe" — tratava os dois como erro.
--
-- Agora são três faixas, e cada uma faz o que deve:
--   * km_chegada < km_saida ............... impossível. Barra no banco.
--   * diferença > 5.000 km ................ é digitação (trocou o hodômetro
--                                           inteiro). Barra no banco.
--   * diferença > 600 km .................. é possível e acontece. Passa, com
--                                           confirmação do técnico, e nasce
--                                           marcado como "KM ALTO VERIFICAR"
--                                           na coluna Pendências do painel.
--
-- Nada de número derivado gravado: a marcação é a coluna `situacao` da view,
-- calculada na hora. O que se grava é o FATO de alguém ter conferido —
-- `km_verificado_em` / `km_verificado_por` — que não é cálculo, é decisão.
--
-- ATENÇÃO: rode 0013_km_alto_historico.sql logo depois desta. Sem ela, todo
-- roteiro antigo com mais de 600 km cai na fila de pendências no primeiro
-- dia — o campo de conferência acabou de nascer nulo para o histórico inteiro.

-- ---------------------------------------------------------------------------
-- 1. O teto vira o limite da digitação, não o da viagem.
--    (Em produção isto já foi aplicado à mão em 2026-08; o `if exists` deixa
--    a migração idempotente e alinha um banco novo com o que está no ar.)
-- ---------------------------------------------------------------------------
alter table public.roteiros drop constraint if exists km_plausivel;
alter table public.roteiros add constraint km_plausivel
  check (km_chegada is null or km_chegada - km_saida <= 5000);

-- ---------------------------------------------------------------------------
-- 2. Quem conferiu o km alto, e quando. Enquanto for null, o roteiro aparece
--    em Pendências. Preenchido, some da fila — sem apagar o histórico.
-- ---------------------------------------------------------------------------
alter table public.roteiros
  add column if not exists km_verificado_em  timestamptz,
  add column if not exists km_verificado_por uuid references public.tecnicos;

-- ---------------------------------------------------------------------------
-- 3. v_roteiros: nova situação, e os horários que faltavam.
--
--    `drop` em vez de `create or replace`: o `r.*` do corpo passou a trazer
--    duas colunas novas, e o replace recusa mudança na lista de colunas.
--    Os grants e o security_invoker são refeitos logo abaixo — sem isso a view
--    voltaria a rodar como dono e entregaria a frota inteira ao técnico.
-- ---------------------------------------------------------------------------
drop view if exists public.v_roteiros;

create view public.v_roteiros as
select r.*, v.placa, v.modelo, v.custo_km,
       ts.nome as tecnico_saida, tc.nome as tecnico_chegada,
       tv.nome as km_verificado_nome,
       round(r.km_rodado * v.custo_km, 2) as custo_roteiro,
       -- horários do dia da operação, não os de Greenwich (ver 0009)
       (r.saida_em   at time zone 'America/Sao_Paulo')::time(0) as hora_saida,
       (r.chegada_em at time zone 'America/Sao_Paulo')::time(0) as hora_chegada,
       -- quanto tempo o veículo ficou fora, em minutos. Null enquanto não
       -- voltou. Minuto e não `interval` porque o que sai do PostgREST vira
       -- texto ("1 day 02:00:00") e a tela teria que reparsear.
       (extract(epoch from (r.chegada_em - r.saida_em)) / 60)::int as duracao_min,
       case
         when r.chegada_em is null and dia_br(r.saida_em) = hoje_br() then 'NA RUA'
         when r.chegada_em is null then 'SEM FECHAMENTO'
         -- km alto vem antes de "dia seguinte" de propósito: viagem longa
         -- costuma virar o dia, e o que o gestor precisa ver é o km.
         when r.km_rodado > 600 and r.km_verificado_em is null
           then 'CONCLUÍDO - KM ALTO VERIFICAR'
         when dia_br(r.chegada_em) > dia_br(r.saida_em) then 'CONCLUÍDO - DIA SEGUINTE'
         else 'CONCLUÍDO'
       end as situacao
from roteiros r
join veiculos v on v.id = r.veiculo_id
join tecnicos ts on ts.id = r.tecnico_saida_id
left join tecnicos tc on tc.id = r.tecnico_chegada_id
left join tecnicos tv on tv.id = r.km_verificado_por;

alter view public.v_roteiros set (security_invoker = on);
grant select on public.v_roteiros to authenticated;
