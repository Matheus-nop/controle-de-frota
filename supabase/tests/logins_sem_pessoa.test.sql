-- Prova de que a ponte entre auth.users e `tecnicos` só abre para o gestor.
-- Roda com: supabase test db
--
-- `logins_sem_pessoa()` e `emails_do_time()` são security definer: rodam como
-- dono para poder ler `auth.users`, que `authenticated` não enxerga. Isso é o
-- que as torna úteis e é exatamente o que as torna perigosas — sem a checagem
-- de papel lá dentro, qualquer técnico logado listaria o e-mail do time todo.
-- É esse buraco que o teste fecha.

begin;
select plan(5);

insert into auth.users (instance_id, id, aud, role, email,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ana@frota.local',    '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'gestor@frota.local', '', now(), now(), now()),
  -- este é o caso do dia a dia: login criado no painel do Supabase e ainda
  -- sem linha em `tecnicos`
  ('00000000-0000-0000-0000-000000000000',
   '99999999-9999-9999-9999-999999999999',
   'authenticated', 'authenticated', 'marcia.souza@frota.local', '', now(), now(), now());

insert into public.tecnicos (id, user_id, nome, papel) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'Ana',    'TECNICO'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '33333333-3333-3333-3333-333333333333', 'Gestor', 'GESTOR');

set local role authenticated;

-- ------------------------------- gestor -----------------------------------
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

select is(
  (select count(*) from public.logins_sem_pessoa())::int, 1,
  'gestor ve o login que ainda nao virou pessoa');

select is(
  (select email from public.logins_sem_pessoa()), 'marcia.souza@frota.local',
  'e o login certo — quem ja tem cadastro nao entra na fila');

select is(
  (select count(*) from public.emails_do_time())::int, 2,
  'gestor ve o e-mail de quem ja esta cadastrado');

-- ------------------------------- tecnica ----------------------------------
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ select * from public.logins_sem_pessoa() $$,
  '42501',
  'TECNICO NAO lista login pendente');

select throws_ok(
  $$ select * from public.emails_do_time() $$,
  '42501',
  'TECNICO NAO lista o e-mail do time');

select * from finish();
rollback;
