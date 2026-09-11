-- =====================================================================
-- Migração 0024: marcar que a manutenção está em garantia, e de quem
-- (idempotente; rode no SQL Editor depois da 0023)
-- =====================================================================
--
-- POR QUE NÃO É UM SIM/NÃO
--
-- "Em garantia" sozinho não serve para a conversa que vem depois. O caso que
-- motivou isto: a Fiorino SRT9D86 foi revisada dia 05/09 e dois dias depois o
-- volante estava desalinhado. Isso é a oficina refazendo o serviço dela — uma
-- briga com a FULL PNEUS. É coisa diferente de um defeito que a concessionária
-- cobre pela garantia de fábrica, ou de uma peça que veio ruim do fornecedor.
-- Guardar de quem é a cobertura é o que permite, daqui a seis meses, olhar o
-- histórico e dizer "essa oficina refez serviço três vezes este ano".
--
-- POR QUE UMA COLUNA SÓ, E ANULÁVEL
--
-- Um booleano `garantia` mais um `garantia_de` deixariam o banco aceitar estado
-- sem sentido: garantia = true sem dizer de quem, ou garantia = false com o
-- "de quem" preenchido. Com uma coluna anulável isso não existe: nulo é "não é
-- garantia", preenchido é "é garantia, e é desta". Um estado, uma coluna.
--
-- Não é derivado de nada: é um fato que o gestor declara. Por isso é coluna
-- gravada e não view, sem conflito com a regra do projeto.

alter table public.manutencoes add column if not exists garantia text;

-- O check entra separado do add column porque `add column if not exists` não
-- reaplica a restrição quando a coluna já existe. Dropar antes de criar é o que
-- deixa a migração rodar duas vezes.
alter table public.manutencoes drop constraint if exists manutencoes_garantia_check;
alter table public.manutencoes add constraint manutencoes_garantia_check
  check (garantia is null or garantia in (
    'RETRABALHO DA OFICINA',
    'FÁBRICA/CONCESSIONÁRIA',
    'FORNECEDOR DA PEÇA'
  ));

comment on column public.manutencoes.garantia is
  'De quem é a cobertura quando o serviço não se paga. Nulo = não é garantia.';

-- Índice parcial: as manutenções em garantia são poucas, e é sempre por elas
-- que se procura ("o que a oficina refez este ano?"). Parcial porque indexar os
-- nulos seria indexar a frota inteira para nada.
create index if not exists manutencoes_garantia_idx
  on public.manutencoes (garantia, aberta_em desc)
  where garantia is not null;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select
  (select count(*) from public.manutencoes where garantia is not null) as em_garantia,
  (select count(*) from public.manutencoes) as total;
