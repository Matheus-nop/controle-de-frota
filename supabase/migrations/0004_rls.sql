-- Fase 2 — RLS: liga a seguranca por linha em todas as tabelas e define quem
-- pode o que. Depende das funcoes de 0003_auth.sql.
-- Revise antes de aplicar: supabase db push
--
-- Modelo: dois papeis. TECNICO lanca e ve o proprio; GESTOR ve e edita tudo.
-- A RLS roda por cima dos GRANTs, entao concedemos o acesso de tabela ao
-- papel `authenticated` e deixamos a RLS filtrar as linhas.

grant select, insert, update, delete
  on public.tecnicos, public.veiculos, public.roteiros,
     public.checklists, public.manutencoes
  to authenticated;

-- ===========================================================================
-- tecnicos
-- Todo autenticado le o cadastro de pessoas: o painel e o app precisam exibir
-- o nome do outro tecnico de um roteiro. Nome/papel nao sao segredo do time.
-- So gestor cria/edita/remove.
-- ===========================================================================
alter table public.tecnicos enable row level security;

create policy tecnicos_select on public.tecnicos
  for select to authenticated using (true);
create policy tecnicos_insert on public.tecnicos
  for insert to authenticated with check (public.is_gestor());
create policy tecnicos_update on public.tecnicos
  for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy tecnicos_delete on public.tecnicos
  for delete to authenticated using (public.is_gestor());

-- ===========================================================================
-- veiculos — todos leem, so gestor escreve
-- ===========================================================================
alter table public.veiculos enable row level security;

create policy veiculos_select on public.veiculos
  for select to authenticated using (true);
create policy veiculos_insert on public.veiculos
  for insert to authenticated with check (public.is_gestor());
create policy veiculos_update on public.veiculos
  for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy veiculos_delete on public.veiculos
  for delete to authenticated using (public.is_gestor());

-- ===========================================================================
-- roteiros — o coracao da regra: tecnico so enxerga/mexe onde ele e o tecnico
-- de saida ou de chegada. Gestor ve e edita tudo.
-- ===========================================================================
alter table public.roteiros enable row level security;

create policy roteiros_select on public.roteiros
  for select to authenticated
  using (
    public.is_gestor()
    or tecnico_saida_id   = public.current_tecnico_id()
    or tecnico_chegada_id = public.current_tecnico_id()
  );

-- na insercao, o tecnico so pode abrir roteiro em nome dele mesmo
create policy roteiros_insert on public.roteiros
  for insert to authenticated
  with check (
    public.is_gestor()
    or tecnico_saida_id = public.current_tecnico_id()
  );

create policy roteiros_update on public.roteiros
  for update to authenticated
  using (
    public.is_gestor()
    or tecnico_saida_id   = public.current_tecnico_id()
    or tecnico_chegada_id = public.current_tecnico_id()
  )
  with check (
    public.is_gestor()
    or tecnico_saida_id   = public.current_tecnico_id()
    or tecnico_chegada_id = public.current_tecnico_id()
  );

create policy roteiros_delete on public.roteiros
  for delete to authenticated using (public.is_gestor());

-- ===========================================================================
-- checklists — tecnico insere e le os proprios; gestor ve todos e corrige
-- ===========================================================================
alter table public.checklists enable row level security;

create policy checklists_select on public.checklists
  for select to authenticated
  using (public.is_gestor() or tecnico_id = public.current_tecnico_id());
create policy checklists_insert on public.checklists
  for insert to authenticated
  with check (public.is_gestor() or tecnico_id = public.current_tecnico_id());
create policy checklists_update on public.checklists
  for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy checklists_delete on public.checklists
  for delete to authenticated using (public.is_gestor());

-- ===========================================================================
-- manutencoes — tecnico so le (a frota inteira); so gestor escreve
-- ===========================================================================
alter table public.manutencoes enable row level security;

create policy manutencoes_select on public.manutencoes
  for select to authenticated using (true);
create policy manutencoes_insert on public.manutencoes
  for insert to authenticated with check (public.is_gestor());
create policy manutencoes_update on public.manutencoes
  for update to authenticated using (public.is_gestor()) with check (public.is_gestor());
create policy manutencoes_delete on public.manutencoes
  for delete to authenticated using (public.is_gestor());

-- ===========================================================================
-- views (0002) rodam, por padrao, com os direitos do DONO da view — o que
-- IGNORARIA a RLS das tabelas de baixo e vazaria a frota inteira para o
-- tecnico. security_invoker faz a view rodar com os direitos de QUEM consulta,
-- entao a RLS das tabelas base tambem vale aqui. (Requer Postgres 15+.)
-- ===========================================================================
alter view public.v_roteiros      set (security_invoker = on);
alter view public.v_alertas       set (security_invoker = on);
alter view public.v_custo_veiculo set (security_invoker = on);

grant select on public.v_roteiros, public.v_alertas, public.v_custo_veiculo
  to authenticated;
