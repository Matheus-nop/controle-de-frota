-- Prova da 0031: quem escreve em `veiculos` depois que o PCM passou a cadastrar.
-- Roda com: supabase test db   (carrega pgTAP e aplica as migrations antes).
--
-- A regra do CLAUDE.md: "Politica nova exige teste que prove o bloqueio."
--
-- Atencao ao que se mede em cada caso, porque NAO e a mesma coisa:
--   * INSERT barrado pela RLS levanta 42501 (insufficient_privilege);
--   * UPDATE e DELETE barrados NAO levantam erro — o `using` simplesmente nao
--     encontra linha, e o comando volta dizendo que mexeu em zero linhas.
-- Testar update com throws_ok passaria por engano, sempre, inclusive com a
-- politica errada. Por isso aqui o update barrado e seguido de uma leitura:
-- o que se prova nao e "deu erro", e sim que o DADO NAO MUDOU.
--
-- Mesma estrategia dos outros: fixtures como dono (ignora RLS), depois
-- `set local role authenticated` e troca do claim `sub` para virar cada um.

begin;
select plan(14);

-- ========================= fixtures (como dono) ============================
insert into auth.users (instance_id, id, aud, role, email,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'gestor@frota.test',  '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'pcm@frota.test',     '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'tecnico@frota.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'ponto@frota.test',   '', now(), now(), now());

insert into public.tecnicos (id, user_id, nome, papel) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '11111111-1111-1111-1111-111111111111', 'Matheus', 'GESTOR'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   '44444444-4444-4444-4444-444444444444', 'Marcia',  'PCM'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '22222222-2222-2222-2222-222222222222', 'Ana',     'TECNICO'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '55555555-5555-5555-5555-555555555555', 'Folha',   'PONTO');

insert into public.veiculos (id, placa, modelo, km_atual, status) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'TEST0001', 'Fiat Strada', 100, 'ATIVO');

set local role authenticated;

-- ================================= PCM =====================================
-- o que a 0031 abriu
select set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.veiculos (placa, modelo) values ('PCM00001', 'Kia Bongo') $$,
  'PCM cadastra veiculo');

update public.veiculos set km_atual = 1000 where placa = 'TEST0001';
select is((select km_atual from public.veiculos where placa = 'TEST0001'), 1000,
  'PCM edita veiculo');

-- continua valendo desde a 0011: abrir manutencao poe o veiculo na oficina
update public.veiculos set status = 'MANUTENCAO' where placa = 'TEST0001';
select is((select status from public.veiculos where placa = 'TEST0001'), 'MANUTENCAO',
  'PCM poe o veiculo na oficina');

-- apagar continua fechado: nao levanta erro, so nao acha linha para apagar
delete from public.veiculos where placa = 'PCM00001';
select is((select count(*)::int from public.veiculos where placa = 'PCM00001'), 1,
  'PCM NAO apaga veiculo — a linha continua la');

-- e `tecnicos` continua fechada: um PCM que editasse papel se promoveria
select throws_ok(
  $$ insert into public.tecnicos (nome, papel) values ('Inventado', 'GESTOR') $$,
  '42501',
  'PCM NAO cadastra pessoa');

update public.tecnicos set papel = 'GESTOR'
  where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
select is((select papel from public.tecnicos
            where id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'), 'PCM',
  'PCM NAO se promove a gestor');

-- =============================== TECNICO ===================================
-- abrir para o PCM nao pode ter afrouxado o que ja estava fechado
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.veiculos (placa, modelo) values ('TEC00001', 'Inventado') $$,
  '42501',
  'TECNICO NAO cadastra veiculo');

update public.veiculos set km_atual = 9 where placa = 'TEST0001';
select is((select km_atual from public.veiculos where placa = 'TEST0001'), 1000,
  'TECNICO NAO edita veiculo — o km continua o que o PCM deixou');

-- ================================ PONTO ====================================
select set_config('request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.veiculos (placa, modelo) values ('PON00001', 'Inventado') $$,
  '42501',
  'PONTO NAO cadastra veiculo');

update public.veiculos set km_atual = 8 where placa = 'TEST0001';
select is((select km_atual from public.veiculos where placa = 'TEST0001'), 1000,
  'PONTO NAO edita veiculo');

-- =============================== GESTOR ====================================
-- controle positivo: sem ele a prova passaria com uma politica que barra todo
-- mundo, que e o jeito mais facil de "passar" num teste de bloqueio
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.veiculos (placa, modelo) values ('GES00001', 'Inventado') $$,
  'GESTOR cadastra veiculo');

update public.veiculos set km_atual = 7 where placa = 'TEST0001';
select is((select km_atual from public.veiculos where placa = 'TEST0001'), 7,
  'GESTOR edita veiculo');

delete from public.veiculos where placa = 'GES00001';
select is((select count(*)::int from public.veiculos where placa = 'GES00001'), 0,
  'GESTOR apaga veiculo');

-- e todo mundo continua LENDO: e isso que da lista para a tela de saida
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select isnt((select count(*)::int from public.veiculos), 0,
  'TECNICO continua lendo a frota');

select * from finish();
rollback;
