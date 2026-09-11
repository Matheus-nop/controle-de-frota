-- =====================================================================
-- Migração 0018: dar ciência num alerta (idempotente; rode depois da 0017)
-- =====================================================================
--
-- O QUE A EQUIPE PEDIU
--
-- "Como funciona o alerta de avaria, para que não fique crescendo o tempo
-- todo? Uma opção de dar ciência talvez?"
--
-- COMO OS ALERTAS FUNCIONAM HOJE
--
-- `v_alertas_ativos` não guarda nada. É uma view: a cada vez que a tela abre,
-- os cinco alertas são recalculados a partir dos dados de verdade. Não existe
-- fila que cresce — existe uma pergunta refeita.
--
-- O de AVARIA compara as DUAS últimas vistorias do veículo e aparece quando a
-- mais nova achou mais dano que a anterior. Ele some sozinho de três jeitos:
-- a vistoria seguinte registra a mesma quantidade (o amassado continua lá, e
-- deixou de ser novidade), a vistoria passa de 60 dias, ou a vistoria é
-- anulada. São no máximo nove linhas de AVARIA, uma por veículo.
--
-- O QUE FALTAVA
--
-- Entre o alerta aparecer e a vistoria seguinte pode passar uma semana, e
-- nessa semana ele fica na tela depois de o gestor já ter visto, decidido e
-- resolvido. Alerta que continua vermelho depois de resolvido ensina a ignorar
-- a tela — e o dia em que ele importar de verdade, ninguém vai olhar.
--
-- DAR CIÊNCIA É DIFERENTE DE APAGAR
--
-- A ciência não muda dado nenhum: a avaria continua lá, a vistoria continua lá.
-- Ela diz "eu vi este alerta, nesta ocorrência". Fica gravada com quem viu,
-- quando e por quê, e a tela mostra isso numa aba à parte.
--
-- A CHAVE É A OCORRÊNCIA, E NÃO O VEÍCULO
--
-- É o detalhe que faz a coisa funcionar. A ciência é gravada contra uma
-- `referencia` — para AVARIA, o id da vistoria que disparou o alerta. Se na
-- semana seguinte outra vistoria achar MAIS dano, a referência é outra, e o
-- alerta volta a aparecer. Dar ciência silencia o que você viu, e nunca o
-- próximo. Sem isso, um clique distraído cegaria o veículo para sempre.
--
-- Cada tipo tem a sua:
--   REVISÃO    → o marco de km. Passou o marco, alerta novo.
--   ROTEIRO    → o id do roteiro sem fechamento.
--   PARADO     → a data do último roteiro. Rodou de novo, o alerta some sozinho.
--   OCORRÊNCIA → o id da ocorrência.
--   AVARIA     → o id da vistoria que achou o dano novo.

-- ---------------------------------------------------------------------
-- A tabela
-- ---------------------------------------------------------------------
create table if not exists public.alertas_ciencia (
  tipo        text        not null,
  veiculo_id  uuid        not null references public.veiculos on delete cascade,
  referencia  text        not null,
  por         uuid        references public.tecnicos on delete set null,
  em          timestamptz not null default now(),
  observacao  text,
  primary key (tipo, veiculo_id, referencia)
);

comment on table public.alertas_ciencia is
  'Quem já viu qual alerta. Não muda dado nenhum — só tira da fila o que foi visto.';
comment on column public.alertas_ciencia.referencia is
  'A OCORRÊNCIA do alerta (id da vistoria, do roteiro, o marco de km). Ocorrência nova volta a alertar.';

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.alertas_ciencia enable row level security;

-- Ler todo mundo lê: a aba "já vistos" mostra quem viu o quê, e esconder isso
-- do PCM só faria ele dar ciência de novo no que o gestor já tratou.
drop policy if exists alertas_ciencia_select on public.alertas_ciencia;
create policy alertas_ciencia_select on public.alertas_ciencia
  for select to authenticated using (true);

-- Escrever, só quem trabalha a fila: gestor e PCM. O técnico não tem esta tela.
drop policy if exists alertas_ciencia_insert on public.alertas_ciencia;
create policy alertas_ciencia_insert on public.alertas_ciencia
  for insert to authenticated
  with check (public.is_gestor() or public.tem_papel('PCM'));

drop policy if exists alertas_ciencia_delete on public.alertas_ciencia;
create policy alertas_ciencia_delete on public.alertas_ciencia
  for delete to authenticated
  using (public.is_gestor() or public.tem_papel('PCM'));

-- Sem update: mudar a observação de uma ciência é desfazer e dar de novo, e aí
-- a data passa a ser a da decisão nova — que é o que ela tem que ser.

grant select, insert, delete on public.alertas_ciencia to authenticated;

-- ---------------------------------------------------------------------
-- v_alertas — tudo, inclusive o que já tem ciência
-- ---------------------------------------------------------------------
-- Os cinco alertas são os da 0007/0014/0017, agora com a coluna `referencia`.
-- Estão aqui inteiros porque `create or replace view` exige a definição toda.
create or replace view v_alertas as
with base as (

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
    null::date as desde,
    ('revisao:' || v.proxima_revisao_km)::text as referencia
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
    r.saida_em::date,
    ('roteiro:' || r.id)::text
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
    u.ultimo,
    ('parado:' || u.ultimo)::text
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
    o.data,
    ('ocorrencia:' || o.id)::text
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
    u.data,
    ('vistoria:' || u.id)::text
  from veiculos v
  join lateral (
    select
      atual.id                        as id,
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
    and u.data >= current_date - 60)
select
  b.*,
  t.nome         as ciencia_por,
  c.em           as ciencia_em,
  c.observacao   as ciencia_observacao
from base b
left join public.alertas_ciencia c
  on c.tipo = b.tipo and c.veiculo_id = b.veiculo_id and c.referencia = b.referencia
left join public.tecnicos t on t.id = c.por;

alter view public.v_alertas set (security_invoker = on);
grant select on public.v_alertas to authenticated;

-- ---------------------------------------------------------------------
-- v_alertas_ativos — a fila, agora sem o que já foi visto
-- ---------------------------------------------------------------------
-- O painel e a tela de alertas continuam lendo daqui, e por isso o contador do
-- painel cai junto quando alguém dá ciência — que é o pedido.
--
-- `referencia` entra no fim da lista de colunas: `create or replace view` deixa
-- ACRESCENTAR coluna, nunca tirar nem reordenar.
create or replace view v_alertas_ativos as
select
  tipo, gravidade, ordem, veiculo_id, placa, modelo, titulo, detalhe, desde, referencia
from public.v_alertas
where ciencia_em is null;

alter view public.v_alertas_ativos set (security_invoker = on);
grant select on public.v_alertas_ativos to authenticated;
