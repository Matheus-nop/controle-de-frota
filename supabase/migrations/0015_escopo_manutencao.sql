-- =====================================================================
-- Migração 0015: escopo de manutenção preventiva, por modelo
-- (idempotente; rode no SQL Editor depois da 0014)
-- =====================================================================
--
-- O QUE A EQUIPE PEDIU
--
--   fiorino - 20.000 km: trocar óleo, filtro, alinhamento e balanceamento
--   fiorino - 30.000 km: trocar pneus
--
-- "Cadastraremos um escopo para quando abrimos a manutenção preventiva; sigam
-- aquele escopo, que será descrito na OS."
--
-- POR MODELO, E NÃO POR VEÍCULO
--
-- A frota tem 9 veículos em 5 modelos: três KIA BONGO, dois FIORINO, dois
-- SCUDO, uma STRADA e um 9.170 DELIVERY. Escopo por placa seriam nove cadastros
-- para cinco planos de manutenção, com três chances de o Bongo do Rafael sair
-- diferente do Bongo do Igor por engano de digitação. Por modelo são cinco, e
-- veículo novo do mesmo modelo já entra com o plano pronto.
--
-- O KM SE REPETE A CADA MÚLTIPLO
--
-- `km_intervalo` = 20.000 quer dizer "a cada 20 mil": vale aos 20, 40, 60, 80.
-- Um marco de 60.000 km puxa a regra de 20.000 (60 é múltiplo) e a de 30.000
-- (60 também é), e não puxa a de 40.000 (60 não é).
--
-- É isso que resolve o caso da pastilha de freio, que não se troca a cada 10 ou
-- 20 mil km: a pastilha não mora na regra de 10.000, mora na regra de 40.000 —
-- ou no km que for o intervalo dela. Cada item fica no km que é o SEU intervalo,
-- e o marco junta o que se encaixa. Não existe uma regra global de repetição:
-- existe uma por linha.
--
-- CONTRA O QUE O MARCO É COMPARADO
--
-- Contra `veiculos.proxima_revisao_km`, e não contra o hodômetro. O odômetro
-- quase nunca cai num múltiplo redondo (66.402 não é múltiplo de nada), e a
-- revisão é planejada para o marco, não para o número exato do dia. Quem abre a
-- preventiva confirma o marco na tela.

create table if not exists escopos_manutencao (
  id            uuid primary key default gen_random_uuid(),
  modelo        text    not null,
  km_intervalo  integer not null,
  itens         text[]  not null default '{}',
  observacao    text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now()
);

-- Rodar duas vezes não pode quebrar: a migração é aplicada à mão no SQL Editor.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'escopos_km_positivo') then
    alter table escopos_manutencao add constraint escopos_km_positivo check (km_intervalo > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'escopos_modelo_km') then
    alter table escopos_manutencao add constraint escopos_modelo_km unique (modelo, km_intervalo);
  end if;
end $$;

comment on table escopos_manutencao is
  'O que fazer na preventiva de cada modelo, por intervalo de km. Um marco puxa toda regra cujo km_intervalo o divide.';
comment on column escopos_manutencao.km_intervalo is
  'A CADA quantos km esta regra vale. 20000 vale aos 20, 40, 60 mil — não só aos 20 mil.';
comment on column escopos_manutencao.itens is
  'O que a oficina tem que fazer. Vira a lista impressa na ordem de serviço.';

create index if not exists idx_escopos_modelo on escopos_manutencao(modelo) where ativo;

-- ---------------------------------------------------------------------
-- O marco que a preventiva atende
-- ---------------------------------------------------------------------
-- Fica na manutenção, e é uma DECISÃO, não um cálculo: quem abre confirma a
-- qual revisão aquela ordem se refere. Os itens não são copiados para cá —
-- a regra do projeto é clara sobre não gravar derivado, e a ordem de serviço
-- monta a lista na hora, a partir do modelo do veículo e deste número.
alter table manutencoes add column if not exists revisao_km integer;

comment on column manutencoes.revisao_km is
  'O marco de revisão que esta preventiva atende (ex.: 60000). Resolve o escopo do modelo na ordem de serviço.';

-- ---------------------------------------------------------------------
-- RLS — mesma divisão da tabela de manutenções
-- ---------------------------------------------------------------------
-- Todo mundo autenticado lê: o técnico que leva o veículo para a oficina
-- precisa conseguir ler a ordem de serviço. Escrita é de quem administra o
-- plano — GESTOR e PCM, que é quem abre e fecha ordem.
alter table escopos_manutencao enable row level security;

drop policy if exists escopos_select on escopos_manutencao;
create policy escopos_select on escopos_manutencao
  for select to authenticated using (true);

drop policy if exists escopos_insert on escopos_manutencao;
create policy escopos_insert on escopos_manutencao
  for insert to authenticated with check (public.is_gestor() or public.tem_papel('PCM'));

drop policy if exists escopos_update on escopos_manutencao;
create policy escopos_update on escopos_manutencao
  for update to authenticated
  using (public.is_gestor() or public.tem_papel('PCM'))
  with check (public.is_gestor() or public.tem_papel('PCM'));

drop policy if exists escopos_delete on escopos_manutencao;
create policy escopos_delete on escopos_manutencao
  for delete to authenticated using (public.is_gestor() or public.tem_papel('PCM'));

grant select, insert, update, delete on escopos_manutencao to authenticated;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
-- Qual escopo cai em cada marco. Rode depois de cadastrar as primeiras regras:
-- a coluna `marco` simula as revisões e mostra o que a OS vai imprimir.
select
  e.modelo,
  m.marco,
  array_agg(i order by e.km_intervalo, i) as itens_da_revisao
from escopos_manutencao e
cross join lateral unnest(e.itens) as i
cross join (values (10000), (20000), (30000), (40000), (60000), (80000)) as m(marco)
where e.ativo
  and m.marco % e.km_intervalo = 0
group by e.modelo, m.marco
order by e.modelo, m.marco;
