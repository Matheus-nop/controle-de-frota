-- Fuso horario nas views: o dia de Sao Paulo, nao o de Greenwich.
-- Revise antes de aplicar: supabase db push (ou cole no SQL editor do Supabase).
--
-- Par da correcao do app (lib/frota/tempo.ts). La era o texto ISO cortado na
-- exibicao; aqui e o `::date` sobre timestamptz, que no Postgres usa o fuso da
-- SESSAO — e a sessao do Supabase e UTC. Mesmo bug, outro andar.
--
-- O estrago nao era so cosmetico. Das 21h a meia-noite, quando o UTC ja virou
-- o dia e Sao Paulo nao:
--   * todo roteiro ainda aberto do dia deixava de ser "NA RUA" e virava
--     "SEM FECHAMENTO" — e alerta CRITICO em /alertas. Todo santo dia, para
--     uma equipe que fecha roteiro de noite.
--   * o roteiro das 20h que voltou as 23h virava "CONCLUÍDO - DIA SEGUINTE".
--   * e a virada de verdade (saiu 22h, voltou 2h) NAO era marcada, porque em
--     UTC os dois instantes caem no mesmo dia.
--
-- Nada de dado muda: `timestamptz` guarda instante, e o instante esta certo.
-- Muda a pergunta "em que dia isso aconteceu?", que so faz sentido com um fuso.
-- Nenhuma coluna nova, nenhum valor derivado gravado — continua tudo em view.

-- ---------------------------------------------------------------------------
-- O fuso mora aqui, e so aqui. `America/Sao_Paulo` e o nome da zona, nao o
-- offset -3: se o horario de verao voltar, o banco se ajusta sozinho.
--
-- stable e nao immutable de proposito: `hoje_br()` depende de now(), e as duas
-- andam juntas para nao virar armadilha ("uma da pra indexar, a outra nao").
-- Na escala deste projeto (9 veiculos) a diferenca nao aparece.
-- ---------------------------------------------------------------------------

-- em que dia, aqui, aconteceu este instante
create or replace function public.dia_br(ts timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (ts at time zone 'America/Sao_Paulo')::date
$$;

-- o dia de hoje, aqui (o `current_date` do projeto)
create or replace function public.hoje_br()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

grant execute on function public.dia_br(timestamptz) to authenticated;
grant execute on function public.hoje_br() to authenticated;

-- ---------------------------------------------------------------------------
-- v_roteiros (0002): a coluna `situacao`, que o painel inteiro le.
-- create or replace preserva os grants e o security_invoker de 0004_rls.sql.
-- ---------------------------------------------------------------------------

create or replace view v_roteiros as
select r.*, v.placa, v.modelo, v.custo_km,
       ts.nome as tecnico_saida, tc.nome as tecnico_chegada,
       round(r.km_rodado * v.custo_km, 2) as custo_roteiro,
       case
         when r.chegada_em is null and dia_br(r.saida_em) = hoje_br() then 'NA RUA'
         when r.chegada_em is null then 'SEM FECHAMENTO'
         when dia_br(r.chegada_em) > dia_br(r.saida_em) then 'CONCLUÍDO - DIA SEGUINTE'
         else 'CONCLUÍDO'
       end as situacao
from roteiros r
join veiculos v on v.id = r.veiculo_id
join tecnicos ts on ts.id = r.tecnico_saida_id
left join tecnicos tc on tc.id = r.tecnico_chegada_id;

-- ---------------------------------------------------------------------------
-- v_alertas_ativos (0007): os tres pontos que datavam em UTC.
-- Corpo identico ao de 0007 fora as chamadas de dia_br/hoje_br.
-- ---------------------------------------------------------------------------

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
-- Roteiro aberto HOJE e so um veiculo na rua, nao um problema. "Hoje" aqui e o
-- dia de Sao Paulo: em UTC, quem sai as 8h e ainda esta na rua as 21h30 seria
-- acusado de nao ter fechado o roteiro do dia anterior.
select
  'ROTEIRO'::text,
  'CRÍTICO'::text,
  1,
  v.id,
  v.placa,
  v.modelo,
  'Roteiro sem fechamento'::text,
  'saiu com ' || r.km_saida || ' km e não registrou chegada'::text,
  dia_br(r.saida_em)
from roteiros r
join veiculos v on v.id = r.veiculo_id
where r.chegada_em is null
  and dia_br(r.saida_em) < hoje_br()

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
  ('sem roteiro há ' || (hoje_br() - u.ultimo) || ' dias')::text,
  u.ultimo
from veiculos v
join lateral (
  select max(dia_br(r.saida_em)) as ultimo
  from roteiros r where r.veiculo_id = v.id
) u on true
where v.status = 'ATIVO'
  and u.ultimo is not null
  and u.ultimo <= hoje_br() - 7

union all

-- 4. OCORRENCIA GRAVE em aberto — dano serio que ninguem tratou ainda
-- (`o.data` e coluna date, sem hora e sem fuso: nada a converter)
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

-- Reafirmado por seguranca: sem isto a view rodaria com os direitos do dono e
-- entregaria a frota inteira para um tecnico (ver 0004_rls.sql).
alter view public.v_roteiros        set (security_invoker = on);
alter view public.v_alertas_ativos  set (security_invoker = on);

grant select on public.v_alertas_ativos to authenticated;
