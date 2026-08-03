-- Prova de que a RLS de `ocorrencias` bloqueia de verdade.
-- Roda com: supabase test db   (carrega pgTAP e aplica as migrations antes).
--
-- A regra do CLAUDE.md: "Politica nova exige teste que prove o bloqueio."
-- Mesma estrategia do rls_roteiros.test.sql: inserimos as fixtures como dono
-- (ignora RLS), depois viramos `authenticated` e trocamos o claim `sub` do JWT
-- para fingir ser cada usuario.

begin;
select plan(7);

-- ========================= fixtures (como dono) ============================
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

insert into public.veiculos (id, placa, modelo) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'TEST0001', 'Fiat Strada');

insert into public.ocorrencias (id, veiculo_id, tecnico_id, tipo, descricao, gravidade) values
  ('f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1',
   'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'DANO', 'Risco na porta esquerda', 'LEVE'),      -- ocorrencia da Ana
  ('f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2',
   'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'ACIDENTE', 'Colisao traseira no estacionamento', 'GRAVE');  -- da Bia

-- ===================== a partir daqui a RLS vale ==========================
set local role authenticated;

-- ---- como Ana (tecnica) ----
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is(
  (select count(*) from public.ocorrencias)::int, 1,
  'Ana enxerga apenas 1 ocorrencia (a dela)');

select is(
  (select count(*) from public.ocorrencias
   where id = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2')::int, 0,
  'Ana NAO enxerga a ocorrencia da Bia');

-- relatar em nome de outra pessoa e o buraco classico: tem que fechar
select throws_ok(
  $$ insert into public.ocorrencias (veiculo_id, tecnico_id, tipo, descricao, gravidade)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
             'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
             'DANO', 'lancada em nome da Bia', 'LEVE') $$,
  '42501',
  'Ana NAO consegue relatar ocorrencia em nome da Bia');

select lives_ok(
  $$ insert into public.ocorrencias (veiculo_id, tecnico_id, tipo, descricao, gravidade)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
             'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
             'AVARIA', 'Pneu dianteiro careca', 'MODERADA') $$,
  'Ana consegue relatar ocorrencia em nome dela mesma');

-- classificar/resolver e trabalho do gestor: o UPDATE do tecnico nao pega linha
select is(
  (with u as (
     update public.ocorrencias set status = 'RESOLVIDA', resolvida_em = current_date
     where id = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1'
     returning 1)
   select count(*) from u)::int, 0,
  'Ana NAO consegue resolver a propria ocorrencia (UPDATE e do gestor)');

-- ---- como Gestor ----
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

select is(
  (select count(*) from public.ocorrencias)::int, 3,
  'Gestor enxerga as 3 ocorrencias');

select is(
  (with u as (
     update public.ocorrencias set status = 'RESOLVIDA', resolvida_em = current_date
     where id = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2'
     returning 1)
   select count(*) from u)::int, 1,
  'Gestor consegue resolver a ocorrencia');

select * from finish();
rollback;
