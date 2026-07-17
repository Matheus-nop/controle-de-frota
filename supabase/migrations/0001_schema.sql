-- Gerado a partir de docs/guia-claude-code-frota.md
-- Revise antes de aplicar: supabase db push

-- pessoas: mata o campo de texto livre que hoje gera
-- "RAFAEL AVILA" / "RAFAEL ÁVILA" / "RAFAEL ÁVILA - DOUGLAS DE SENA"
create table tecnicos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users unique,   -- null = técnico ainda sem login
  nome text not null,
  ativo boolean not null default true
);

create table veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,                   -- sem espaço, sem hífen: SRT9D55
  modelo text not null,
  ano text,
  responsavel_id uuid references tecnicos,
  km_atual integer,
  proxima_revisao_km integer,
  status text not null default 'ATIVO'
    check (status in ('ATIVO','MANUTENCAO','BLOQUEADO','VENDIDO')),
  consumo_km_l numeric(5,2),
  valor_combustivel numeric(6,2),
  obs text,
  -- custo por km deixa de ser fórmula arrastada e vira definição do banco
  custo_km numeric(8,4) generated always as
    (valor_combustivel / nullif(consumo_km_l, 0)) stored
);

create table roteiros (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references veiculos,
  -- saída
  tecnico_saida_id uuid not null references tecnicos,
  saida_em timestamptz not null,
  km_saida integer not null,
  obs_saida text,
  foto_painel_saida text,
  -- chegada (null enquanto o veículo está na rua)
  tecnico_chegada_id uuid references tecnicos,
  chegada_em timestamptz,
  km_chegada integer,
  obs_chegada text,
  foto_painel_chegada text,
  houve_pendencia boolean,
  descricao_pendencias text,

  km_rodado integer generated always as (km_chegada - km_saida) stored,

  -- as validações que a planilha não tem:
  constraint km_coerente check (km_chegada is null or km_chegada >= km_saida),
  constraint km_plausivel check (km_chegada is null or km_chegada - km_saida <= 600),
  constraint chegada_coerente check (chegada_em is null or chegada_em >= saida_em)
);

-- impede dois roteiros abertos para o mesmo veículo:
-- é o que hoje produz "CHEGADA SEM SAÍDA" e roteiro duplicado
create unique index um_roteiro_aberto_por_veiculo
  on roteiros (veiculo_id) where chegada_em is null;

create table manutencoes (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references veiculos,
  aberta_em date not null default current_date,
  km_abertura integer,
  origem text check (origem in ('CHECKLIST SEMANAL','ROTEIRO','ACIDENTE/AVARIA','PREVENTIVA PROGRAMADA','OUTRO')),
  tipo text check (tipo in ('PREVENTIVA','CORRETIVA')),
  descricao_problema text not null,
  prioridade text check (prioridade in ('BAIXA','MÉDIA','ALTA','EMERGENCIAL')),
  responsavel_id uuid references tecnicos,
  oficina text,
  orcamento numeric(10,2),
  status text not null default 'ABERTA'
    check (status in ('ABERTA','EM EXECUÇÃO','CONCLUÍDA','CANCELADA')),
  concluida_em date,
  valor_final numeric(10,2),
  servico_realizado text,
  pecas_trocadas text,
  proxima_revisao_km integer,
  nota_fiscal_url text
);

create table checklists (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references veiculos,
  tecnico_id uuid not null references tecnicos,
  data date not null default current_date,
  km_atual integer not null,
  itens jsonb not null,          -- {"pneus":true,"farois":true,"ar_condicionado":false,...}
  apto boolean not null,
  motivo_bloqueio text,
  descricao text,
  urgencia text check (urgencia in ('BAIXA','MÉDIA','ALTA','EMERGENCIAL')),
  foto_url text
);
