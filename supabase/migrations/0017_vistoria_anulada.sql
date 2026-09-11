-- =====================================================================
-- Migração 0017: vistoria anulada (o "excluir" do gestor) e fotos anexadas
-- (idempotente; rode no SQL Editor depois da 0016)
-- =====================================================================
--
-- O QUE A EQUIPE PEDIU
--
-- "Quero excluir um checklist quando feito incorretamente."
--
-- Acontece: o técnico escolhe o veículo errado, digita o km com um zero a mais,
-- ou faz a mesma vistoria duas vezes. O registro errado fica no histórico, entra
-- no comparativo e pode até disparar alerta de avaria nova — atrapalhando
-- justamente quem tenta entender o que aconteceu com o veículo.
--
-- POR QUE ANULAR, E NÃO APAGAR
--
-- Vistoria é prova. É o que responde "este amassado já estava aí semana
-- passada?", e é para isso que o comparativo e as fotos existem. Um DELETE
-- apaga o registro e deixa as fotos órfãs no Storage, sem volta: se o gestor
-- excluir a linha errada — duas vistorias do mesmo veículo no mesmo dia é o
-- caso normal, não o raro — não há como recuperar.
--
-- Então a vistoria anulada SAI DE TUDO (histórico, comparativo, último
-- checklist do técnico, alerta de avaria nova) e continua guardada, com quem
-- anulou, quando e por quê. Para quem usa o app, é excluir. Para o banco, é
-- reversível. O gestor restaura em "Ver anuladas" no histórico.
--
-- A policy de DELETE de `checklists` continua existindo desde a 0004 e continua
-- sendo só do gestor — este arquivo não a remove. O app é que deixou de usá-la.

-- ---------------------------------------------------------------------
-- As colunas
-- ---------------------------------------------------------------------
-- `anulada_por` é FK para tecnicos, e não texto: nome de pessoa neste sistema
-- nunca é texto livre. `on delete set null` porque desligar um usuário não pode
-- derrubar o registro de que a vistoria foi anulada.
alter table public.checklists
  add column if not exists anulada_em      timestamptz,
  add column if not exists anulada_por     uuid references public.tecnicos on delete set null,
  add column if not exists motivo_anulacao text;

comment on column public.checklists.anulada_em is
  'Quando o gestor anulou a vistoria. Não nulo = a vistoria não conta em lugar nenhum.';
comment on column public.checklists.motivo_anulacao is
  'Por que foi anulada. Obrigatório na tela — anulação sem motivo vira mistério em três semanas.';

-- Todas as consultas do app passaram a pedir `anulada_em is null`. O índice
-- parcial é o que serve essa pergunta sem carregar as anuladas junto.
create index if not exists checklists_ativas_idx
  on public.checklists (veiculo_id, data desc)
  where anulada_em is null;

-- ---------------------------------------------------------------------
-- O alerta de avaria nova precisa pular as anuladas
-- ---------------------------------------------------------------------
-- Sem isto, anular a vistoria de hoje deixaria o alerta comparando a de ontem
-- com a de anteontem e mandando o gestor para um comparativo que ele já
-- resolveu. Os quatro primeiros alertas são os da 0007/0014, sem uma vírgula de
-- diferença: `create or replace view` exige a definição inteira.
create or replace view v_alertas_ativos as

-- 1. REVISAO — vencida (passou do km) ou proxima (faltam <= 2000 km)
select
  'REVISÃO'::text as tipo,
  case when v.km_atual >= v.proxima_revisao_km
       then 'CRÍTICO'::text else 'ATENÇÃO'::text end as gravidade,
  case when v.km_atual >= v.proxima_revisao_km then 1 else 3 end as ordem,
  v.id as veiculo_id,
  v.placa,
  v.modelo,
  case when v.km_atual >= v.proxima_revisao_km
       then 'Revisão vencida'::text else 'Revisão próxima'::text end as titulo,
  case when v.km_atual >= v.proxima_revisao_km
       then 'passou ' || (v.km_atual - v.proxima_revisao_km) || ' km da revisão dos ' || v.proxima_revisao_km || ' km'
       else 'faltam ' || (v.proxima_revisao_km - v.km_atual) || ' km para a revisão dos ' || v.proxima_revisao_km || ' km'
  end as detalhe,
  null::date as desde
from veiculos v
where v.status = 'ATIVO'
  and v.km_atual is not null
  and v.proxima_revisao_km is not null
  and v.proxima_revisao_km - v.km_atual <= 2000

union all

-- 2. ROTEIRO SEM FECHAMENTO — saiu num dia anterior e nunca registrou chegada.
select
  'ROTEIRO'::text,
  'CRÍTICO'::text,
  1,
  v.id,
  v.placa,
  v.modelo,
  'Roteiro sem fechamento'::text,
  'saiu com ' || r.km_saida || ' km e não registrou chegada'::text,
  r.saida_em::date
from roteiros r
join veiculos v on v.id = r.veiculo_id
where r.chegada_em is null
  and r.saida_em::date < current_date

union all

-- 3. VEICULO PARADO — rodava e parou de rodar ha 7 dias ou mais.
select
  'PARADO'::text,
  'ATENÇÃO'::text,
  3,
  v.id,
  v.placa,
  v.modelo,
  'Veículo parado'::text,
  ('sem roteiro há ' || (current_date - u.ultimo) || ' dias')::text,
  u.ultimo
from veiculos v
join lateral (
  select max(r.saida_em::date) as ultimo
  from roteiros r where r.veiculo_id = v.id
) u on true
where v.status = 'ATIVO'
  and u.ultimo is not null
  and u.ultimo <= current_date - 7

union all

-- 4. OCORRENCIA GRAVE em aberto — dano serio que ninguem tratou ainda
select
  'OCORRÊNCIA'::text,
  'CRÍTICO'::text,
  1,
  v.id,
  v.placa,
  v.modelo,
  'Ocorrência grave em aberto'::text,
  o.tipo || ': ' || o.descricao,
  o.data
from ocorrencias o
join veiculos v on v.id = o.veiculo_id
where o.gravidade = 'GRAVE'
  and o.status in ('ABERTA', 'EM ANÁLISE')

union all

-- 5. AVARIA NOVA — a última vistoria achou mais dano que a anterior.
--
-- Compara as DUAS últimas vistorias do veículo. O desempate por `id` importa:
-- duas vistorias no mesmo dia acontecem (o técnico refaz depois de corrigir
-- algo), e sem ele "a anterior" seria sorteada.
--
-- Exige vistoria anterior de propósito: o primeiro checklist de um veículo
-- registra o que já existia nele, e não um dano novo. Sem essa exigência, todo
-- veículo recém-cadastrado nasceria em alerta.
--
-- Os 60 dias existem pela mesma razão do alerta 3: alerta velho ensina o gestor
-- a ignorar a tela. Vistoria é semanal — se a última tem mais de dois meses, o
-- problema não é a avaria, é a vistoria que parou de acontecer.
select
  'AVARIA'::text,
  'ATENÇÃO'::text,
  2,
  v.id,
  v.placa,
  v.modelo,
  'Avaria nova no checklist'::text,
  ('a vistoria de ' || to_char(u.data, 'DD/MM') || ' registrou ' || u.qtd
    || case when u.qtd = 1 then ' avaria' else ' avarias' end
    || '; a de ' || to_char(u.data_ant, 'DD/MM') || ' tinha ' || u.qtd_ant)::text,
  u.data
from veiculos v
join lateral (
  select
    atual.data                      as data,
    public.qtd_avarias(atual.itens) as qtd,
    ant.data                        as data_ant,
    public.qtd_avarias(ant.itens)   as qtd_ant
  from checklists atual
  left join lateral (
    select c2.data, c2.itens
    from checklists c2
    where c2.veiculo_id = atual.veiculo_id
      and c2.anulada_em is null
      and (c2.data, c2.id) < (atual.data, atual.id)
    order by c2.data desc, c2.id desc
    limit 1
  ) ant on true
  where atual.veiculo_id = v.id
    and atual.anulada_em is null
  order by atual.data desc, atual.id desc
  limit 1
) u on true
where v.status <> 'VENDIDO'
  and u.data_ant is not null
  and u.qtd > u.qtd_ant
  and u.data >= current_date - 60;

-- Sem isto a view rodaria com os direitos do dono e entregaria a frota inteira
-- para um tecnico. Mesmo cuidado das views de 0002 (ver 0004_rls.sql).
alter view public.v_alertas_ativos set (security_invoker = on);

grant select on public.v_alertas_ativos to authenticated;
