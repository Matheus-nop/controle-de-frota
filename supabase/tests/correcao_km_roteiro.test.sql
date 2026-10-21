-- Prova da 0032: o rastro da correcao de km, e a view que foi recriada.
-- Roda com: supabase test db   (carrega pgTAP e aplica as migrations antes).
--
-- Duas coisas a provar, e a segunda e a que da medo:
--
--   1. `correcoes` so aceita lista. Um objeto no lugar da lista passaria no
--      insert e quebraria a leitura do rastro na tela, caladinho.
--
--   2. v_roteiros sobreviveu ao drop/recreate. A 0032 DERRUBA a view para que
--      o `r.*` enxergue a coluna nova — e com ela vao junto o grant e o
--      `security_invoker`. Perder o security_invoker nao da erro nenhum: a view
--      passa a rodar como DONO e entrega a frota inteira a qualquer tecnico.
--      E uma falha aberta, que e o pior tipo, e por isso ela tem asserçao
--      propria aqui.
--
-- Nenhuma politica nova: `roteiros_update` (gestor, ou o tecnico do proprio
-- roteiro) ja existia desde a 0004 e e por ela que a correcao entra.

begin;
select plan(9);

-- ========================= fixtures (como dono) ============================
insert into auth.users (instance_id, id, aud, role, email,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'gestor@frota.test',  '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'ana@frota.test',     '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'bia@frota.test',     '', now(), now(), now());

insert into public.tecnicos (id, user_id, nome, papel) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '11111111-1111-1111-1111-111111111111', 'Matheus', 'GESTOR'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '22222222-2222-2222-2222-222222222222', 'Ana',     'TECNICO'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '33333333-3333-3333-3333-333333333333', 'Bia',     'TECNICO');

insert into public.veiculos (id, placa, modelo, consumo_km_l, valor_combustivel) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'VBE2I48', 'Strada', 10, 6);

-- O caso real: saiu com 2012 km quando o hodometro marcava 212.
insert into public.roteiros (id, veiculo_id, tecnico_saida_id, saida_em, km_saida) values
  ('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a',
   'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '3 hours', 2012);

-- ------------------------- o rastro so aceita lista ------------------------
select is(
  (select correcoes from public.roteiros where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  '[]'::jsonb,
  'roteiro novo nasce com o rastro vazio, nao nulo');

select throws_ok(
  $$ update public.roteiros set correcoes = '{"campo":"km"}'::jsonb
      where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a' $$,
  '23514',
  'objeto no lugar da lista e recusado pelo banco');

-- =========================== a RLS passa a valer ===========================
set local role authenticated;

-- ---- como Gestor: corrige o km e carimba o rastro ----
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

update public.roteiros
   set km_saida = 212,
       correcoes = correcoes || jsonb_build_array(jsonb_build_object(
         'campo','km de saida','de','2.012 km','para','212 km',
         'por','Matheus','em', now()::text))
 where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a';

select is(
  (select km_saida from public.roteiros where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  212,
  'GESTOR corrige o km de saida');

select is(
  (select jsonb_array_length(correcoes) from public.roteiros
    where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  1,
  'a correcao deixou rastro');

-- e agora a chegada que estava impossivel fecha
select lives_ok(
  $$ update public.roteiros
        set chegada_em = now(), km_chegada = 250,
            tecnico_chegada_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
      where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a' $$,
  'depois de corrigida, a chegada fecha (era isso que estava travado)');

-- ---- como Bia: o roteiro nao e dela ----
-- update barrado pela RLS nao levanta erro, so nao acha linha: a prova e que
-- o DADO NAO MUDOU.
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

update public.roteiros set km_saida = 999
 where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a';

-- A leitura de volta e como GESTOR, e nao como Bia: a Bia tambem nao ENXERGA
-- esse roteiro (roteiros_select e por tecnico), entao perguntar a ela devolve
-- NULL — o que seria um "passou" por motivo errado, escondendo um update que
-- tivesse funcionado.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(
  (select km_saida from public.roteiros where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  212,
  'TECNICA NAO corrige o km do roteiro de outra pessoa');

-- ---------------------- a view sobreviveu ao recreate ----------------------
select is(
  (select km_rodado from public.v_roteiros where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  38,
  'v_roteiros continua calculando km_rodado (250 - 212)');

select is(
  (select situacao from public.v_roteiros where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  'CONCLUÍDO',
  'v_roteiros continua classificando a situacao');

-- A asserçao que pega a falha aberta: sem security_invoker a view roda como
-- dono e a Bia, que nao e tecnica deste roteiro, enxergaria a linha.
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.v_roteiros
    where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  0,
  'v_roteiros continua com security_invoker: a Bia nao ve o roteiro da Ana');

select * from finish();
rollback;
