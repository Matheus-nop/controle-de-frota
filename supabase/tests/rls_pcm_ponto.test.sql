-- Prova de que os papeis novos (PCM e PONTO) veem o que devem e SO isso.
-- Roda com: supabase test db   (carrega pgTAP e aplica as migrations antes).
--
-- A regra do CLAUDE.md: "Politica nova exige teste que prove o bloqueio."
-- O que precisa ficar provado aqui, porque e onde da errado:
--   * PONTO le roteiro (e o trabalho dele) e NAO escreve nada.
--   * PCM escreve manutencao (e o trabalho dele) e NAO mexe em roteiro.
--   * nenhum dos dois vira gestor por tabela: cadastrar veiculo continua
--     fechado para os dois.
--
-- Mesma estrategia dos outros: fixtures como dono (ignora RLS), depois
-- `set local role authenticated` e troca do claim `sub` para virar cada um.

begin;
select plan(11);

-- ========================= fixtures (como dono) ============================
insert into auth.users (instance_id, id, aud, role, email,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ana@frota.test',   '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'pcm@frota.test',   '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '55555555-5555-5555-5555-555555555555',
   'authenticated', 'authenticated', 'ponto@frota.test', '', now(), now(), now());

insert into public.tecnicos (id, user_id, nome, papel) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'Ana',   'TECNICO'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   '44444444-4444-4444-4444-444444444444', 'Marcia','PCM'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   '55555555-5555-5555-5555-555555555555', 'Folha', 'PONTO');

insert into public.veiculos (id, placa, modelo) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'TEST0001', 'Fiat Strada');

-- um roteiro da Ana, fechado
insert into public.roteiros (id, veiculo_id, tecnico_saida_id, saida_em, km_saida,
                             tecnico_chegada_id, chegada_em, km_chegada)
values ('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a',
        'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        now() - interval '9 hours', 1000,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        now() - interval '1 hour', 1150);

-- ===================== a partir daqui a RLS vale ==========================
set local role authenticated;

-- ------------------------------- PONTO ------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);

select is(
  (select count(*) from public.roteiros)::int, 1,
  'PONTO enxerga o roteiro da Ana (e para isso que ele existe)');

select is(
  (select count(*) from public.v_conferencia_ponto)::int, 1,
  'PONTO enxerga a linha na view de conferencia');

-- o horario, que e o dado que ele foi buscar, precisa estar preenchido
select isnt(
  (select hora_saida from public.v_conferencia_ponto limit 1), null,
  'a view entrega a hora de saida, nao so a data');

select isnt(
  (select hora_chegada from public.v_conferencia_ponto limit 1), null,
  'a view entrega a hora de chegada do roteiro fechado');

-- so leitura: nao lanca roteiro nem corrige o dos outros
select throws_ok(
  $$ update public.roteiros set km_chegada = 9999
      where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a' returning 1 $$,
  '42501',
  'PONTO NAO corrige o km de um roteiro');

select throws_ok(
  $$ insert into public.manutencoes (veiculo_id, descricao_problema)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'inventada pelo ponto') $$,
  '42501',
  'PONTO NAO abre manutencao');

-- ------------------------------- PCM --------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.manutencoes (veiculo_id, descricao_problema, origem, tipo)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
             'Revisao dos 10.000', 'PREVENTIVA PROGRAMADA', 'PREVENTIVA') $$,
  'PCM abre manutencao');

select lives_ok(
  $$ update public.veiculos set status = 'MANUTENCAO'
      where id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1' $$,
  'PCM poe o veiculo na oficina (senao ele continuaria disponivel no painel)');

select throws_ok(
  $$ insert into public.veiculos (placa, modelo) values ('NOVO0001', 'Inventado') $$,
  '42501',
  'PCM NAO cadastra veiculo — isso continua sendo do gestor');

select throws_ok(
  $$ insert into public.roteiros (veiculo_id, tecnico_saida_id, saida_em, km_saida)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
             'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now(), 2000) $$,
  '42501',
  'PCM NAO lanca roteiro em nome de tecnico');

-- ------------------------------ TECNICO -----------------------------------
-- o papel novo nao pode ter afrouxado o que ja estava fechado
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.manutencoes (veiculo_id, descricao_problema)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'aberta pela tecnica') $$,
  '42501',
  'TECNICO continua sem abrir manutencao');

select * from finish();
rollback;
