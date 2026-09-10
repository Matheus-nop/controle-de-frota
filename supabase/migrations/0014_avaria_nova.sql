-- =====================================================================
-- Migração 0014: alerta de avaria nova, comparando uma vistoria com a anterior
-- (idempotente; rode no SQL Editor depois da 0013)
-- =====================================================================
--
-- O QUE A EQUIPE PEDIU
--
-- "Checklist da Strada ontem com 2 avarias; hoje com 3 — dispara um alerta."
--
-- É a pergunta certa: dano que aparece entre uma vistoria e outra apareceu com
-- alguém dirigindo, e quanto mais tarde se descobre, menos se sabe quando foi.
--
-- O QUE PRECISOU MUDAR ANTES
--
-- O formulário guardava UMA avaria por vistoria (`itens.avaria`). Contar 2 e 3
-- era impossível: o segundo dano do dia sobrescrevia o primeiro ou virava texto
-- solto na descrição. A tela agora grava uma lista (`itens.avarias`), e as
-- vistorias antigas continuam no banco na forma antiga — vistoria é registro do
-- que alguém viu num dia, e reescrever isso para caber num formato novo é
-- perder a prova.
--
-- Por isso a contagem entende as duas formas. A regra está em duas linguagens —
-- aqui e em `lib/frota/avarias.ts` — e as duas TÊM que concordar: o alerta diz
-- "3 avarias" e a tela precisa mostrar três. Mexeu numa, mexa na outra.

-- Avaria de verdade, e não casca vazia. O formulário antigo gravava
-- `avaria: {}` quando alguém marcava SIM e voltava atrás sem preencher; contar
-- isso como dano faria a frota inteira nascer em alerta.
create or replace function public.avaria_preenchida(a jsonb)
returns boolean language sql immutable as $$
  select a is not null
     and jsonb_typeof(a) = 'object'
     and (   coalesce(btrim(a ->> 'onde'), '') <> ''
          or coalesce(btrim(a ->> 'tipo'), '') <> ''
          or coalesce(btrim(a ->> 'descricao'), '') <> ''
          or jsonb_array_length(
               case when jsonb_typeof(a -> 'fotos') = 'array' then a -> 'fotos' else '[]'::jsonb end
             ) > 0);
$$;

comment on function public.avaria_preenchida(jsonb) is
  'Se um objeto de avaria tem algum conteúdo. Espelha `uma()` em lib/frota/avarias.ts.';

-- Quantas avarias a vistoria registrou, nas duas formas do jsonb.
create or replace function public.qtd_avarias(itens jsonb)
returns int language sql immutable as $$
  select case
    -- Forma nova: a lista manda. Se ela existe, a chave antiga é ignorada —
    -- mesma precedência de `avariasDe()` no app.
    when jsonb_typeof(itens -> 'avarias') = 'array' then
      (select count(*)::int
         from jsonb_array_elements(itens -> 'avarias') a
        where public.avaria_preenchida(a.value))
    -- Forma antiga: uma avaria só.
    when public.avaria_preenchida(itens -> 'avaria') then 1
    else 0
  end;
$$;

comment on function public.qtd_avarias(jsonb) is
  'Quantas avarias a vistoria registrou. Entende `avarias` (lista, atual) e `avaria` (objeto, antigo).';

-- ---------------------------------------------------------------------
-- A view de alertas, com o quinto alerta
-- ---------------------------------------------------------------------
-- Os quatro primeiros são os da 0007, sem uma vírgula de diferença. Estão aqui
-- porque `create or replace view` exige a definição inteira.
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
      and (c2.data, c2.id) < (atual.data, atual.id)
    order by c2.data desc, c2.id desc
    limit 1
  ) ant on true
  where atual.veiculo_id = v.id
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
