-- =====================================================================
-- Migração 0027: revisões programadas e pacotes de revisão gratuita
-- (idempotente; rode no SQL Editor depois da 0026)
-- =====================================================================
--
-- O PROBLEMA
--
-- A frota comprou alinhamento e balanceamento e o prestador deu direito a seis
-- revisões gratuitas. Hoje nada no sistema sabe que esse saldo existe: a
-- manutenção só passa a existir depois de aberta, e o alerta de revisão só
-- compara o hodômetro com `proxima_revisao_km` do veículo. O resultado
-- previsível é o benefício vencer sem ser usado — paga-se por sete serviços e
-- usam-se dois.
--
-- SÃO DUAS COISAS, E ELAS SE ENCAIXAM
--
-- 1. AGENDAR. Uma manutenção passa a poder existir ANTES de acontecer, com
--    data marcada e situação AGENDADA. É o que faltava para "revisão
--    programada" querer dizer alguma coisa: até aqui, manutenção só nascia
--    quando o veículo já estava parado.
--
-- 2. O PACOTE. O que o prestador vendeu — tantas revisões, deste serviço,
--    nesta oficina, com validade. Cada revisão usada é uma manutenção comum,
--    apontando para o pacote.
--
-- POR QUE O SALDO NÃO É COLUNA
--
-- "Quantas sobram" é contagem de manutenções apontando para o pacote. Gravar
-- esse número criaria duas fontes de verdade que divergem no primeiro
-- cancelamento. Fica na view `v_pacotes_revisao`, junto com a próxima prevista
-- e os dias para vencer — regra do projeto: número novo é view.
--
-- POR QUE A MANUTENÇÃO CANCELADA NÃO CONSOME
--
-- Agendou, o veículo não pôde ir, cancelou: o prestador não gastou a revisão.
-- A contagem ignora CANCELADA — por isso ela é contagem, e não um contador que
-- alguém teria de lembrar de decrementar na mão.

-- ---------------------------------------------------------------------
-- 1. Agendar: data marcada e a situação AGENDADA
-- ---------------------------------------------------------------------
alter table public.manutencoes add column if not exists agendada_para date;

-- A situação AGENDADA entra no check. Dropar antes de criar é o que deixa a
-- migração rodar duas vezes; o nome do constraint vem da 0001.
alter table public.manutencoes drop constraint if exists manutencoes_status_check;
alter table public.manutencoes add constraint manutencoes_status_check
  check (status in ('AGENDADA','ABERTA','EM EXECUÇÃO','CONCLUÍDA','CANCELADA'));

comment on column public.manutencoes.agendada_para is
  'Dia marcado com a oficina. Preenchido na situação AGENDADA; segue valendo depois, como registro do que foi combinado.';

-- ---------------------------------------------------------------------
-- 2. O pacote vendido pelo prestador
-- ---------------------------------------------------------------------
create table if not exists public.pacotes_revisao (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos on delete cascade,
  prestador text not null,
  servico text not null,
  contratado_em date not null default current_date,
  km_contratado integer,
  revisoes_gratuitas integer not null check (revisoes_gratuitas > 0),
  -- A cadência sugerida pelo prestador. As duas podem existir: o que vencer
  -- primeiro manda, que é como a oficina fala.
  cada_km integer check (cada_km is null or cada_km > 0),
  cada_dias integer check (cada_dias is null or cada_dias > 0),
  vence_em date,
  observacao text,
  criado_por uuid references public.tecnicos on delete set null,
  criado_em timestamptz not null default now(),
  encerrado_em date
);

-- Colunas em `add column if not exists` para o caso de a tabela já existir de
-- uma rodada anterior desta mesma migração em que ela era menor.
alter table public.pacotes_revisao
  add column if not exists km_contratado integer,
  add column if not exists cada_km integer,
  add column if not exists cada_dias integer,
  add column if not exists vence_em date,
  add column if not exists observacao text,
  add column if not exists encerrado_em date;

create index if not exists pacotes_revisao_veiculo_idx
  on public.pacotes_revisao (veiculo_id) where encerrado_em is null;

-- A manutenção que consome uma revisão do pacote.
alter table public.manutencoes add column if not exists pacote_id uuid;
do $$ begin
  alter table public.manutencoes add constraint manutencoes_pacote_fk
    foreign key (pacote_id) references public.pacotes_revisao on delete set null;
exception when duplicate_object then null; end $$;
create index if not exists manutencoes_pacote_idx
  on public.manutencoes (pacote_id) where pacote_id is not null;

-- ---------------------------------------------------------------------
-- 3. RLS — igual à dos escopos: todo mundo lê, gestor e PCM mexem
-- ---------------------------------------------------------------------
alter table public.pacotes_revisao enable row level security;

drop policy if exists pacotes_select on public.pacotes_revisao;
create policy pacotes_select on public.pacotes_revisao
  for select to authenticated using (true);

drop policy if exists pacotes_insert on public.pacotes_revisao;
create policy pacotes_insert on public.pacotes_revisao
  for insert to authenticated
  with check (public.is_gestor() or public.tem_papel('PCM'));

drop policy if exists pacotes_update on public.pacotes_revisao;
create policy pacotes_update on public.pacotes_revisao
  for update to authenticated
  using (public.is_gestor() or public.tem_papel('PCM'))
  with check (public.is_gestor() or public.tem_papel('PCM'));

drop policy if exists pacotes_delete on public.pacotes_revisao;
create policy pacotes_delete on public.pacotes_revisao
  for delete to authenticated
  using (public.is_gestor() or public.tem_papel('PCM'));

grant select, insert, update, delete on public.pacotes_revisao to authenticated;

-- ---------------------------------------------------------------------
-- 4. O saldo e a próxima prevista — tudo calculado, nada gravado
-- ---------------------------------------------------------------------
create or replace view public.v_pacotes_revisao as
with uso as (
  select
    m.pacote_id,
    count(*)                                        as usadas,
    max(m.concluida_em)                             as ultima_em,
    max(m.km_abertura)                              as ultimo_km
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
  -- A próxima prevista conta a partir da última usada; sem nenhuma usada,
  -- conta da contratação. Nulo quando o prestador não deu cadência.
  case when p.cada_dias is null then null
       else coalesce(u.ultima_em, p.contratado_em) + p.cada_dias
  end                                                     as proxima_em,
  case when p.cada_km is null then null
       else coalesce(u.ultimo_km, p.km_contratado) + p.cada_km
  end                                                     as proxima_km,
  case when p.vence_em is null then null
       else p.vence_em - current_date
  end                                                     as dias_para_vencer
from public.pacotes_revisao p
join public.veiculos v on v.id = p.veiculo_id
left join uso u on u.pacote_id = p.id;

alter view public.v_pacotes_revisao set (security_invoker = on);
grant select on public.v_pacotes_revisao to authenticated;

-- ---------------------------------------------------------------------
-- 5. Os alertas: a revisão agendada, e a gratuita que está indo embora
-- ---------------------------------------------------------------------
-- A view é recriada inteira com os cinco ramos que já existiam mais dois. O
-- `create or replace` só aceita ACRESCENTAR coluna, nunca tirar nem reordenar
-- — e aqui a lista de colunas não muda, só entram linhas novas.
create or replace view v_alertas_com_ciencia as
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
    and u.data >= current_date - 60

  union all

  -- 6. REVISÃO AGENDADA — marcada com a oficina e o dia chegou (ou passou).
  --
  -- Só enquanto a situação ainda é AGENDADA: assim que alguém abre ou conclui
  -- a manutenção, o alerta some sozinho, sem ninguém precisar dar ciência.
  select
    'AGENDADA'::text,
    case when m.agendada_para < current_date
         then 'CRÍTICO'::text else 'ATENÇÃO'::text end,
    case when m.agendada_para < current_date then 1 else 3 end,
    v.id,
    v.placa,
    v.modelo,
    case when m.agendada_para < current_date
         then 'Revisão agendada não aconteceu'::text
         else 'Revisão agendada chegando'::text end,
    (m.descricao_problema
      || case when m.oficina is not null then ' · ' || m.oficina else '' end
      || case when m.agendada_para < current_date
              then ' · era para ' || to_char(m.agendada_para, 'DD/MM')
                   || ', há ' || (current_date - m.agendada_para) || ' dia'
                   || case when current_date - m.agendada_para = 1 then '' else 's' end
              when m.agendada_para = current_date
              then ' · hoje, ' || to_char(m.agendada_para, 'DD/MM')
              else ' · ' || to_char(m.agendada_para, 'DD/MM')
                   || ', em ' || (m.agendada_para - current_date) || ' dias'
         end)::text,
    m.agendada_para,
    ('agendada:' || m.id)::text
  from public.manutencoes m
  join public.veiculos v on v.id = m.veiculo_id
  where m.status = 'AGENDADA'
    and m.agendada_para is not null
    and m.agendada_para <= current_date + 7

  union all

  -- 7. REVISÃO GRATUITA — o pacote tem saldo e ele está indo embora.
  --
  -- Um ramo só, e não dois, porque "a revisão venceu" e "o pacote está
  -- acabando" levam à mesma ação: marcar com a oficina. Dois alertas sobre o
  -- mesmo pacote no mesmo dia seriam ruído, e ruído ensina a ignorar a tela.
  --
  -- A referência leva o número de revisões já usadas. É o que faz a ciência
  -- valer só para o ciclo atual: usou uma, a referência muda, e o alerta da
  -- próxima aparece limpo em vez de ficar silenciado para sempre.
  select
    'REVISÃO GRATUITA'::text,
    case when p.dias_para_vencer is not null and p.dias_para_vencer <= 15
         then 'CRÍTICO'::text else 'ATENÇÃO'::text end,
    case when p.dias_para_vencer is not null and p.dias_para_vencer <= 15
         then 1 else 2 end,
    p.veiculo_id,
    p.placa,
    p.modelo,
    (p.restantes || ' revis' || case when p.restantes = 1 then 'ão' else 'ões' end
      || ' gratuita' || case when p.restantes = 1 then '' else 's' end
      || ' de ' || lower(p.servico))::text,
    (p.prestador
      || case when p.dias_para_vencer is not null and p.dias_para_vencer <= 45
              then ' · o pacote vence em ' || to_char(p.vence_em, 'DD/MM')
                   || ', em ' || p.dias_para_vencer || ' dias'
              else '' end
      || case when p.proxima_em is not null and p.proxima_em <= current_date
              then ' · a próxima era para ' || to_char(p.proxima_em, 'DD/MM')
              else '' end
      || case when p.proxima_km is not null and p.km_atual is not null
                   and p.km_atual >= p.proxima_km
              then ' · passou ' || (p.km_atual - p.proxima_km)
                   || ' km da próxima (' || p.proxima_km || ' km)'
              else '' end)::text,
    p.vence_em,
    ('pacote:' || p.id || ':' || p.usadas)::text
  from public.v_pacotes_revisao p
  where p.restantes > 0
    and p.encerrado_em is null
    and (p.vence_em is null or p.vence_em >= current_date)
    and (
      (p.dias_para_vencer is not null and p.dias_para_vencer <= 45)
      or (p.proxima_em is not null and p.proxima_em <= current_date)
      or (p.proxima_km is not null and p.km_atual is not null
          and p.km_atual >= p.proxima_km)
    ))
select
  b.*,
  t.nome         as ciencia_por,
  c.em           as ciencia_em,
  c.observacao   as ciencia_observacao
from base b
left join public.alertas_ciencia c
  on c.tipo = b.tipo and c.veiculo_id = b.veiculo_id and c.referencia = b.referencia
left join public.tecnicos t on t.id = c.por;

alter view public.v_alertas_com_ciencia set (security_invoker = on);
grant select on public.v_alertas_com_ciencia to authenticated;

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
from public.v_alertas_com_ciencia
where ciencia_em is null;

alter view public.v_alertas_ativos set (security_invoker = on);
grant select on public.v_alertas_ativos to authenticated;
