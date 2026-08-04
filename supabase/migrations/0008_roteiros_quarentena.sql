-- Quarentena da migracao do historico.
-- Revise antes de aplicar: supabase db push (ou cole no SQL editor do Supabase).
--
-- Divida da Fase 1: a planilha tem 286 roteiros e 49 deles violam alguma
-- constraint de `roteiros`. O guia e explicito — nao descartar e nao forcar.
-- Descartar perde historico; forcar significa afrouxar a constraint que existe
-- justamente para impedir o que a planilha deixou acontecer.
--
-- Entao os 49 entram AQUI, crus, com o motivo. Ficam consultaveis e podem ser
-- promovidos para `roteiros` um a um, quando alguem souber o que houve.
--
-- Nada aqui e FK obrigatoria de proposito: o registro pode ter placa que nao
-- resolve ou tecnico que nao existe — e por isso mesmo que ele esta na
-- quarentena. Guardamos o texto bruto ao lado do id resolvido.

create table public.roteiros_quarentena (
  id uuid primary key default gen_random_uuid(),

  origem text not null default 'PLANILHA',
  linha_origem text,                       -- ID_AUTO da aba KM_DIARIO
  importado_em timestamptz not null default now(),

  -- resolvido quando deu; o bruto fica sempre
  veiculo_id uuid references public.veiculos,
  veiculo_bruto text,
  tecnico_saida_id uuid references public.tecnicos,
  tecnico_saida_bruto text,
  tecnico_chegada_id uuid references public.tecnicos,
  tecnico_chegada_bruto text,

  saida_em timestamptz,
  km_saida integer,
  chegada_em timestamptz,
  km_chegada integer,
  status_planilha text,
  houve_pendencia boolean,
  descricao_pendencias text,
  obs text,

  -- por que nao entrou em roteiros. Mais de um motivo por linha e comum.
  motivos text[] not null,

  -- o gestor marca quando resolveu (promoveu, corrigiu ou descartou)
  resolvido boolean not null default false,
  resolucao text
);

-- a fila de trabalho: o que ainda nao foi olhado
create index roteiros_quarentena_pendentes_idx
  on public.roteiros_quarentena (importado_em) where not resolvido;

-- idempotencia da migracao: rodar duas vezes nao duplica
create unique index roteiros_quarentena_origem_idx
  on public.roteiros_quarentena (origem, linha_origem)
  where linha_origem is not null;

-- ===========================================================================
-- RLS — so gestor. Aqui nao ha "o meu": sao registros quebrados da frota
-- inteira, com nome de todo mundo, esperando decisao de quem administra.
-- Tecnico nao ve nem o proprio, porque o proprio pode nem ter sido resolvido.
-- ===========================================================================
grant select, insert, update, delete on public.roteiros_quarentena to authenticated;

alter table public.roteiros_quarentena enable row level security;

create policy quarentena_select on public.roteiros_quarentena
  for select to authenticated using (public.is_gestor());
create policy quarentena_insert on public.roteiros_quarentena
  for insert to authenticated with check (public.is_gestor());
create policy quarentena_update on public.roteiros_quarentena
  for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy quarentena_delete on public.roteiros_quarentena
  for delete to authenticated using (public.is_gestor());
