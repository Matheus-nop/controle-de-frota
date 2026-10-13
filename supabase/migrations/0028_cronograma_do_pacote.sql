-- =====================================================================
-- Migração 0028: a previsão do pacote passa a contar a revisão agendada,
-- e o cartão separa o que foi feito do que está marcado
-- (idempotente; rode no SQL Editor depois da 0027)
-- =====================================================================
--
-- O DEFEITO
--
-- Na 0027, `usadas` contava toda manutenção do pacote que não fosse CANCELADA
-- — inclusive a AGENDADA, que ainda não aconteceu —, mas `ultima_em` só olhava
-- `concluida_em`, que na agendada é nulo.
--
-- O resultado é um cartão que se contradiz: agendar consome o saldo mas não
-- move a previsão, então a próxima continua sendo calculada a partir da
-- contratação. Foi o que apareceu na frota: "2 de 6 usadas" com a próxima
-- prevista para 24/09, uma data ANTERIOR ao serviço feito em 03/10.
--
-- A CORREÇÃO
--
-- `ultima_em` passa a ser `coalesce(concluida_em, agendada_para)`: a data que
-- vale é quando a revisão aconteceu ou, se ainda não aconteceu, quando está
-- marcada para acontecer. Agendar o dia 18 empurra a próxima para o dia 18
-- mais a cadência — que é o que qualquer pessoa esperaria.
--
-- Efeito colateral bom: assim que a próxima é agendada, o alerta de REVISÃO
-- GRATUITA para de cobrar (a previsão foi para o futuro) e quem cobra passa a
-- ser o alerta de AGENDADA, perto do dia. Um alerta de cada vez, sobre a coisa
-- certa.
--
-- E "USADAS" VIRA DUAS CONTAS
--
-- "2 de 6 usadas" é verdade e é confuso: uma foi feita, a outra só está
-- marcada. As duas contas novas deixam o cartão dizer "1 feita · 1 agendada ·
-- sobram 4", que é o que o gestor precisa saber para falar com o prestador.
--
-- As colunas entram NO FIM da lista: `create or replace view` aceita
-- acrescentar coluna, nunca tirar nem reordenar — e a v_alertas_com_ciencia
-- lê esta view, então mexer na ordem derrubaria a cadeia inteira.

create or replace view public.v_pacotes_revisao as
with uso as (
  select
    m.pacote_id,
    count(*)                                              as usadas,
    count(*) filter (where m.status = 'CONCLUÍDA')        as feitas,
    count(*) filter (where m.status <> 'CONCLUÍDA')       as agendadas,
    -- A data que vale é quando aconteceu; não tendo acontecido, quando está
    -- marcada. Sem isso, agendar consome saldo sem mover a previsão.
    max(coalesce(m.concluida_em, m.agendada_para))        as ultima_em,
    max(m.km_abertura)                                    as ultimo_km
  from public.manutencoes m
  where m.pacote_id is not null
    and m.status <> 'CANCELADA'
  group by m.pacote_id
)
select
  p.id,
  p.veiculo_id,
  v.placa,
  v.modelo,
  v.km_atual,
  p.prestador,
  p.servico,
  p.contratado_em,
  p.km_contratado,
  p.revisoes_gratuitas,
  p.cada_km,
  p.cada_dias,
  p.vence_em,
  p.observacao,
  p.encerrado_em,
  coalesce(u.usadas, 0)::integer                           as usadas,
  (p.revisoes_gratuitas - coalesce(u.usadas, 0))::integer  as restantes,
  u.ultima_em,
  u.ultimo_km,
  case when p.cada_dias is null then null
       else coalesce(u.ultima_em, p.contratado_em) + p.cada_dias
  end                                                      as proxima_em,
  case when p.cada_km is null then null
       else coalesce(u.ultimo_km, p.km_contratado) + p.cada_km
  end                                                      as proxima_km,
  case when p.vence_em is null then null
       else p.vence_em - current_date
  end                                                      as dias_para_vencer,
  coalesce(u.feitas, 0)::integer                           as feitas,
  coalesce(u.agendadas, 0)::integer                        as agendadas
from public.pacotes_revisao p
join public.veiculos v on v.id = p.veiculo_id
left join uso u on u.pacote_id = p.id;

alter view public.v_pacotes_revisao set (security_invoker = on);
grant select on public.v_pacotes_revisao to authenticated;

-- ---------------------------------------------------------------------
-- Conferência: o cronograma de cada pacote, como o papel vai imprimir
-- ---------------------------------------------------------------------
select
  pr.placa,
  pr.servico,
  pr.feitas || ' feita(s) · ' || pr.agendadas || ' agendada(s) · sobram ' || pr.restantes as saldo,
  to_char(pr.proxima_em, 'DD/MM/YYYY') as proxima_prevista
from public.v_pacotes_revisao pr
order by pr.placa;
