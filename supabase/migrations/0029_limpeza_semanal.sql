-- =====================================================================
-- Migração 0029: checklist de limpeza semanal, feito pela expedição
-- (idempotente; rode no SQL Editor depois da 0028)
-- =====================================================================
--
-- O QUE É
--
-- Toda semana a expedição confere a limpeza de cada veículo: lataria, vidros,
-- cabine, área de carga. Item por item, conforme ou não conforme — a mesma
-- gramática da vistoria semanal, que a equipe já sabe preencher.
--
-- POR QUE TABELA PRÓPRIA, E NÃO UM BLOCO DENTRO DE `checklists`
--
-- São dois trabalhos, de dois times, em dois momentos. A vistoria é do técnico
-- que dirige e fala de segurança: pneu, freio, luz. A limpeza é da expedição e
-- fala de apresentação. Juntá-las obrigaria a vistoria a carregar campos que o
-- técnico não preenche — e a adesão de uma passaria a depender da outra, que é
-- exatamente o que não se quer medir.
--
-- Quem registra é gestor ou PCM, decisão do gestor: a expedição não ganha
-- login próprio por enquanto. Se um dia ganhar, é uma policy a mais aqui e um
-- papel a mais na 0011 — nada do que está abaixo muda.
--
-- POR QUE OS ITENS SÃO JSONB, E NÃO COLUNAS
--
-- A lista de itens vai mudar: a frota ganha um baú, alguém decide conferir o
-- estepe. Coluna por item viraria uma migração a cada conversa de corredor, e
-- o registro antigo ficaria com coluna nula que ninguém sabe se é "não
-- conferido" ou "não existia". No jsonb, o que não foi perguntado simplesmente
-- não está lá. É a mesma escolha que `checklists.itens` já fez.

create table if not exists public.limpezas (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos on delete cascade,
  data date not null default current_date,
  -- {"lataria":"CONFORME","vidros":"NÃO CONFORME",...}
  itens jsonb not null default '{}'::jsonb,
  observacao text,
  -- as fotos do que estava fora de conformidade
  fotos jsonb not null default '[]'::jsonb,
  registrado_por uuid references public.tecnicos on delete set null,
  criado_em timestamptz not null default now()
);

alter table public.limpezas
  add column if not exists observacao text,
  add column if not exists fotos jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.limpezas add constraint limpezas_itens_objeto
    check (jsonb_typeof(itens) = 'object');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.limpezas add constraint limpezas_fotos_lista
    check (jsonb_typeof(fotos) = 'array');
exception when duplicate_object then null; end $$;

-- A consulta é sempre "as limpezas deste veículo, da mais nova para a mais
-- velha" ou "as do período". O índice serve às duas.
create index if not exists limpezas_veiculo_data_idx
  on public.limpezas (veiculo_id, data desc);

-- ---------------------------------------------------------------------
-- RLS — todo mundo lê, gestor e PCM registram
-- ---------------------------------------------------------------------
-- Ler é aberto de propósito: o técnico que pega o carro deve poder ver que ele
-- passou pela limpeza. Escrever é de quem faz o trabalho.
alter table public.limpezas enable row level security;

drop policy if exists limpezas_select on public.limpezas;
create policy limpezas_select on public.limpezas
  for select to authenticated using (true);

drop policy if exists limpezas_insert on public.limpezas;
create policy limpezas_insert on public.limpezas
  for insert to authenticated
  with check (public.is_gestor() or public.tem_papel('PCM'));

drop policy if exists limpezas_update on public.limpezas;
create policy limpezas_update on public.limpezas
  for update to authenticated
  using (public.is_gestor() or public.tem_papel('PCM'))
  with check (public.is_gestor() or public.tem_papel('PCM'));

drop policy if exists limpezas_delete on public.limpezas;
create policy limpezas_delete on public.limpezas
  for delete to authenticated using (public.is_gestor());

grant select, insert, update, delete on public.limpezas to authenticated;

-- ---------------------------------------------------------------------
-- Conferência
-- ---------------------------------------------------------------------
select
  (select count(*) from public.limpezas) as limpezas_registradas,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'limpezas') as policies;
