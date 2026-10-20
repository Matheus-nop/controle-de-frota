-- =====================================================================
-- Migração 0030: lavagem como tipo de manutenção
-- (idempotente; rode no SQL Editor depois da 0029)
-- =====================================================================
--
-- O QUE MUDA
--
-- `manutencoes.tipo` aceitava PREVENTIVA e CORRETIVA. Entra LAVAGEM.
--
-- POR QUE EM `tipo`, E NÃO EM `origem`
--
-- `origem` responde "de onde veio a demanda" — o checklist achou, o roteiro
-- quebrou, bateram no carro. A lavagem não vem de lugar nenhum: ela é o
-- próprio serviço, programado de antemão. Quem responde "que serviço é este"
-- é o `tipo`.
--
-- POR QUE NÃO VIROU TABELA PRÓPRIA
--
-- O gestor decidiu que a lavagem é paga, com nota fiscal, e que o custo tem
-- que somar no gasto do veículo. Tudo isso já existe em `manutencoes`: valor,
-- orçamento, oficina, notas fiscais, ordem de serviço impressa, agendamento e
-- alerta. Uma tabela nova obrigaria a reconstruir as sete coisas para ganhar
-- zero — e deixaria a lavagem de fora do gráfico de gastos, que é justamente
-- onde ele quer vê-la.
--
-- A confusão possível — lavagem aparecendo no meio de troca de óleo nas listas
-- — se resolve com filtro na tela, não com tabela separada.
--
-- POR QUE A LIMPEZA SEMANAL CONTINUA ONDE ESTÁ
--
-- São coisas diferentes: a limpeza (0029) é a CONFERÊNCIA que a expedição faz
-- toda semana, de graça, por dentro. A lavagem é o SERVIÇO pago, mensal, num
-- prestador. Uma verifica, a outra executa.

alter table public.manutencoes drop constraint if exists manutencoes_tipo_check;
alter table public.manutencoes add constraint manutencoes_tipo_check
  check (tipo is null or tipo in ('PREVENTIVA', 'CORRETIVA', 'LAVAGEM'));

comment on column public.manutencoes.tipo is
  'PREVENTIVA (plano do modelo), CORRETIVA (quebrou) ou LAVAGEM (serviço mensal de limpeza, pago).';

-- A pergunta do mês é "quais veículos ainda não foram lavados". O índice serve
-- a ela: filtra por tipo e ordena por data dentro do mês.
create index if not exists manutencoes_lavagem_idx
  on public.manutencoes (tipo, agendada_para desc)
  where tipo = 'LAVAGEM';

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select
  (select count(*) from public.manutencoes where tipo = 'LAVAGEM') as lavagens,
  (select count(*) from public.manutencoes) as manutencoes_total;
