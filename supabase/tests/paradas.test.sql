-- Prova da 0033: quem escreve a parada, e o que ela faz com a fila de alertas.
-- Roda com: supabase test db   (carrega pgTAP e aplica as migrations antes).
--
-- A regra do CLAUDE.md: "Politica nova exige teste que prove o bloqueio."
--
-- Alem da RLS, duas coisas que sao o motivo da migracao existir:
--   * o alerta COM TERCEIRO aparece enquanto a parada durar, e some quando
--     `ate` passa — e nao quando alguem da ciencia, que nao se aplica aqui;
--   * o alerta PARADO ("sem roteiro ha N dias") CALA enquanto a parada durar.
--     Sem isso a Scudo ficaria com dois alertas dizendo o mesmo silencio.

begin;
select plan(13);

-- ========================= fixtures (como dono) ============================
insert into auth.users (instance_id, id, aud, role, email,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'gestor@frota.test', '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'pcm@frota.test',    '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'ana@frota.test',    '', now(), now(), now());

insert into public.tecnicos (id, user_id, nome, papel) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '11111111-1111-1111-1111-111111111111', 'Matheus', 'GESTOR'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   '44444444-4444-4444-4444-444444444444', 'Marcia',  'PCM'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '22222222-2222-2222-2222-222222222222', 'Ana',     'TECNICO');

insert into public.veiculos (id, placa, modelo, status) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'SCU0A00', 'Fiat Scudo', 'ATIVO');

-- O veiculo rodou e parou ha muito tempo: e isso que acende o alerta PARADO.
insert into public.roteiros (veiculo_id, tecnico_saida_id, saida_em, km_saida,
                             tecnico_chegada_id, chegada_em, km_chegada)
values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        now() - interval '90 days', 1000,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        now() - interval '90 days' + interval '6 hours', 1120);

-- ---------------------- antes da parada: PARADO acende ---------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.v_alertas_ativos
    where veiculo_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1' and tipo = 'PARADO'),
  1,
  'sem parada registrada, o alerta PARADO acende (rodou e parou)');

-- =============================== quem escreve ==============================
-- ---- PCM: leva o veiculo para a oficina, entao registra ----
select set_config('request.jwt.claims',
  '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.paradas (id, veiculo_id, de, ate, onde, motivo)
     values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
             'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
             current_date - 30, null, 'ITAVEMA', 'MANUTENÇÃO CORRETIVA') $$,
  'PCM registra a parada');

-- duas abertas no mesmo veiculo seriam duas respostas para "onde ele esta"
select throws_ok(
  $$ insert into public.paradas (veiculo_id, de, onde, motivo)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
             current_date - 5, 'OUTRA OFICINA', 'SINISTRO') $$,
  '23505',
  'so uma parada ABERTA por veiculo');

-- fim antes do comeco nao existe
select throws_ok(
  $$ insert into public.paradas (veiculo_id, de, ate, onde, motivo)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
             current_date - 5, current_date - 9, 'X', 'Y') $$,
  '23514',
  'a volta nao pode ser antes da ida');

-- apagar e so do gestor: parada errada se corrige editando, e apagar some com
-- a prova de onde o veiculo estava. Delete barrado nao levanta erro.
delete from public.paradas where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
select is(
  (select count(*)::int from public.paradas
    where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  1,
  'PCM NAO apaga parada');

-- ---- TECNICO: le, mas nao escreve ----
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is(
  (select onde from public.paradas where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'ITAVEMA',
  'TECNICO LE a parada — quem nao acha o veiculo merece saber onde ele esta');

select throws_ok(
  $$ insert into public.paradas (veiculo_id, de, onde, motivo)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', current_date, 'X', 'Y') $$,
  '42501',
  'TECNICO NAO registra parada');

update public.paradas set onde = 'INVENTADO'
 where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(
  (select onde from public.paradas where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'ITAVEMA',
  'TECNICO NAO edita parada');

-- ============================== o alerta ===================================
select is(
  (select count(*)::int from public.v_alertas_ativos
    where veiculo_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1' and tipo = 'COM TERCEIRO'),
  1,
  'com a parada aberta, o alerta COM TERCEIRO acende');

select is(
  (select titulo from public.v_alertas_ativos
    where veiculo_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1' and tipo = 'COM TERCEIRO'),
  'Veículo com ITAVEMA',
  'o titulo diz com QUEM o veiculo esta');

select is(
  (select count(*)::int from public.v_alertas_ativos
    where veiculo_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1' and tipo = 'PARADO'),
  0,
  'o alerta PARADO cala: a gente ja sabe por que ele esta parado');

-- ---- fechada a parada, tudo volta ao que era ----
update public.paradas set ate = current_date - 1
 where id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

select is(
  (select count(*)::int from public.v_alertas_ativos
    where veiculo_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1' and tipo = 'COM TERCEIRO'),
  0,
  'parada encerrada: o alerta some sozinho, sem ninguem dar ciencia');

select is(
  (select count(*)::int from public.v_alertas_ativos
    where veiculo_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1' and tipo = 'PARADO'),
  1,
  'e o PARADO volta a acender, porque o veiculo voltou e continua sem rodar');

select * from finish();
rollback;
