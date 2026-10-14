-- Prova da migração 0029: quem registra limpeza e quem só lê.
-- Roda com: supabase test db   (carrega pgTAP e aplica as migrations antes).
--
-- A regra do CLAUDE.md: "Politica nova exige teste que prove o bloqueio."
-- O teste so vale se o gestor PASSAR no mesmo lugar em que o tecnico APANHA:
-- senao estaria provando que ninguem consegue, e nao que a politica separa os
-- papeis. Por isso cada bloqueio tem o seu controle positivo logo abaixo.
--
-- Ler e aberto de proposito: o tecnico que pega o carro deve poder ver que ele
-- passou pela limpeza. E isso que a primeira assercao fixa.

begin;
select plan(8);

insert into auth.users (instance_id, id, aud, role, email,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ze@frota.test',  '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'ana@frota.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'pcm@frota.test', '', now(), now(), now());

insert into public.tecnicos (id, user_id, nome, papel) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', '11111111-1111-1111-1111-111111111111', 'Ze',  'TECNICO'),
  ('a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2', '22222222-2222-2222-2222-222222222222', 'Ana', 'GESTOR'),
  ('a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3', '33333333-3333-3333-3333-333333333333', 'Joao','PCM');

insert into public.veiculos (id, placa, modelo, status, km_atual)
values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'SRT9D65', 'FIAT FIORINO', 'ATIVO', 73494);

insert into public.limpezas (id, veiculo_id, data, itens, registrado_por)
values ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
        current_date, '{"lataria":"CONFORME","vidros":"NÃO CONFORME"}'::jsonb,
        'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2');

-- ============================== TECNICO ====================================
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.limpezas), 1::bigint,
  'TECNICO LE a limpeza — ele precisa saber se o carro passou');

select throws_ok(
  $$ insert into public.limpezas (veiculo_id, itens)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', '{"lataria":"CONFORME"}'::jsonb) $$,
  '42501',
  'TECNICO nao registra limpeza');

select lives_ok(
  $$ update public.limpezas set observacao = 'invadido'
      where id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1' $$,
  'o update do tecnico nao levanta erro — a RLS filtra a linha em vez de recusar');
select is((select observacao from public.limpezas where id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1'),
  null, 'TECNICO nao altera: nenhuma linha foi atingida');

-- =============================== GESTOR ====================================
-- O mesmo insert tem que PASSAR, senao o bloqueio acima nao provou nada.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.limpezas (veiculo_id, itens)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', '{"lataria":"CONFORME"}'::jsonb) $$,
  'GESTOR registra limpeza — e o que prova que o bloqueio do tecnico e da politica');

select lives_ok(
  $$ update public.limpezas set observacao = 'lavado na sexta'
      where id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1' $$,
  'GESTOR corrige a limpeza');
select is((select observacao from public.limpezas where id = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1'),
  'lavado na sexta', 'a correcao do gestor pegou de verdade');

-- ================================= PCM =====================================
reset role;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.limpezas (veiculo_id, itens)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', '{"vidros":"CONFORME"}'::jsonb) $$,
  'PCM registra limpeza');

reset role;
select * from finish();
rollback;
