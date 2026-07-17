-- Fase 2 — prova de que a RLS bloqueia de verdade.
-- Roda com: supabase test db   (carrega pgTAP e aplica as migrations antes).
--
-- A regra do CLAUDE.md: "Politica nova exige teste que prove o bloqueio.
-- RLS mal escrita falha aberta e ninguem percebe." Este arquivo e essa prova.
--
-- Estrategia: inserimos os dados como `postgres` (dono, ignora a RLS). Depois
-- viramos o papel para `authenticated` e trocamos o claim `sub` do JWT para
-- fingir ser cada usuario — e a partir dai a RLS passa a valer.

begin;
select plan(6);

-- ========================= fixtures (como dono) ============================
-- Tres usuarios de auth: Ana (tecnica), Bia (tecnica), Gestor.
insert into auth.users (instance_id, id, aud, role, email,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ana@frota.test',   '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'bia@frota.test',   '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'gestor@frota.test','', now(), now(), now());

insert into public.tecnicos (id, user_id, nome, papel) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'Ana',    'TECNICO'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '22222222-2222-2222-2222-222222222222', 'Bia',    'TECNICO'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '33333333-3333-3333-3333-333333333333', 'Gestor', 'GESTOR');

-- Dois veiculos: o indice um_roteiro_aberto_por_veiculo proibe dois roteiros
-- abertos no MESMO veiculo, entao cada tecnica abre no seu.
insert into public.veiculos (id, placa, modelo) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'TEST0001', 'Fiat Strada'),
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'TEST0002', 'Fiat Strada');

insert into public.roteiros (id, veiculo_id, tecnico_saida_id, saida_em, km_saida) values
  ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1',
   'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 1000),  -- roteiro da Ana
  ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2',
   'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', now(), 2000);   -- roteiro da Bia

-- ===================== a partir daqui a RLS vale ==========================
set local role authenticated;

-- ---- como Ana (tecnica) ----
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is(
  (select count(*) from public.roteiros)::int, 1,
  'Ana enxerga apenas 1 roteiro (o dela)');

select is(
  (select count(*) from public.roteiros
   where id = 'e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2')::int, 0,
  'Ana NAO enxerga o roteiro da Bia');

select throws_ok(
  $$ insert into public.veiculos (placa, modelo) values ('TEST9999','X') $$,
  '42501',
  'Tecnica NAO consegue cadastrar veiculo (so gestor escreve)');

-- ---- como Bia (tecnica) ----
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is(
  (select count(*) from public.roteiros
   where id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1')::int, 0,
  'Bia NAO enxerga o roteiro da Ana');

-- ---- como Gestor ----
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

select is(
  (select count(*) from public.roteiros)::int, 2,
  'Gestor enxerga os 2 roteiros');

select lives_ok(
  $$ insert into public.veiculos (placa, modelo) values ('TEST9999','X') $$,
  'Gestor consegue cadastrar veiculo');

select * from finish();
rollback;
