-- Alertas ativos — o que precisa da atencao do gestor AGORA.
-- Revise antes de aplicar: supabase db push (ou cole no SQL editor do Supabase).
--
-- Depende de 0005_ocorrencias.sql (o quarto alerta le a tabela ocorrencias).
--
-- E uma view porque alerta e calculo derivado, e a regra do projeto e clara:
-- nada de numero derivado gravado em tabela. Nenhuma coluna nova, nenhum job,
-- nenhum campo `esta_atrasado` para alguem esquecer de atualizar — a verdade e
-- recalculada a cada consulta.
--
-- O `v_alertas` (0002) continua existindo e intocado: ele responde "qual a
-- situacao de revisao de cada veiculo", uma linha por veiculo. Este responde
-- outra pergunta — "o que esta pegando fogo" — e devolve uma linha por
-- problema, de tipos diferentes, para virar uma lista so na tela.

create view v_alertas_ativos as

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
-- Roteiro aberto HOJE e so um veiculo na rua, nao um problema.
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
--
-- Exige um roteiro anterior de proposito. Veiculo que NUNCA saiu nao esta
-- parado, esta sem historico — e sem historico nao da para distinguir o
-- esquecido do recem-cadastrado. Sem essa exigencia, no dia seguinte ao reset
-- dos dados de teste a tela nasceria com a frota inteira em alerta, que e a
-- forma mais rapida de ensinar o gestor a ignorar alerta.
--
-- Veiculo em manutencao ou bloqueado tambem nao entra: ali o motivo de estar
-- parado ja e conhecido.
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
  and o.status in ('ABERTA', 'EM ANÁLISE');

-- Sem isto a view rodaria com os direitos do dono e entregaria a frota inteira
-- para um tecnico. Mesmo cuidado das views de 0002 (ver 0004_rls.sql).
alter view public.v_alertas_ativos set (security_invoker = on);

grant select on public.v_alertas_ativos to authenticated;
