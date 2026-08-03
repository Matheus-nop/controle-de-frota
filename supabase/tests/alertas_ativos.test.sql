-- v_alertas_ativos: prova que a view alerta o que deve e cala sobre o resto.
-- Roda com: supabase test db
--
-- Um alerta que grita a toa e pior que alerta nenhum — em duas semanas o gestor
-- aprende a ignorar a tela. Por isso metade deste arquivo testa SILENCIO: os
-- casos que NAO podem virar alerta.
--
-- A ultima secao prova o `security_invoker` da view: sem ele a view rodaria com
-- os direitos do dono e entregaria a frota inteira para qualquer tecnico.

begin;
select plan(9);

-- ========================= fixtures (como dono) ============================
insert into auth.users (instance_id, id, aud, role, email,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ana@frota.test',    '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'bia@frota.test',    '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'gestor@frota.test', '', now(), now(), now());

insert into public.tecnicos (id, user_id, nome, papel) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'Ana',    'TECNICO'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '22222222-2222-2222-2222-222222222222', 'Bia',    'TECNICO'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '33333333-3333-3333-3333-333333333333', 'Gestor', 'GESTOR');

insert into public.veiculos (id, placa, modelo, status, km_atual, proxima_revisao_km) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'AAA0001', 'Strada',  'ATIVO',      69500, 70000),
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'BBB0002', 'Fiorino', 'ATIVO',      71000, 70000),
  ('d3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3', 'CCC0003', 'Scudo',   'ATIVO',      10000, 90000),
  ('d4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4', 'DDD0004', 'Bongo',   'ATIVO',       5000, 90000),
  ('d5d5d5d5-d5d5-d5d5-d5d5-d5d5d5d5d5d5', 'EEE0005', 'Bongo',   'ATIVO',       8000, 90000),
  ('d6d6d6d6-d6d6-d6d6-d6d6-d6d6d6d6d6d6', 'FFF0006', 'Scudo',   'MANUTENCAO',  3000, 90000),
  ('d7d7d7d7-d7d7-d7d7-d7d7-d7d7d7d7d7d7', 'GGG0007', 'Scudo',   'VENDIDO',    99000, 20000),
  ('d8d8d8d8-d8d8-d8d8-d8d8-d8d8d8d8d8d8', 'HHH0008', 'Bongo',   'ATIVO',       7000, 90000);

insert into public.roteiros (veiculo_id, tecnico_saida_id, saida_em, km_saida, chegada_em, km_chegada) values
  -- CCC: aberto ha 3 dias -> sem fechamento
  ('d3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '3 days', 10000, null, null),
  -- EEE: saiu e voltou hoje -> nada
  ('d5d5d5d5-d5d5-d5d5-d5d5-d5d5d5d5d5d5', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '2 hours', 8000, now(), 8080),
  -- FFF: parado ha 60 dias, mas esta em manutencao
  ('d6d6d6d6-d6d6-d6d6-d6d6-d6d6d6d6d6d6', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '60 days', 3000, now() - interval '60 days', 3010),
  -- HHH: rodava e parou ha 12 dias -> parado de verdade
  ('d8d8d8d8-d8d8-d8d8-d8d8-d8d8d8d8d8d8', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '12 days', 7000, now() - interval '12 days', 7050);

insert into public.ocorrencias (veiculo_id, tecnico_id, tipo, descricao, gravidade, status) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'ACIDENTE', 'Colisao na traseira', 'GRAVE', 'ABERTA'),
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'ACIDENTE', 'Ja resolvida', 'GRAVE', 'RESOLVIDA'),
  ('d3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   'DANO', 'Risco na porta', 'LEVE', 'ABERTA');

-- ============================ o que deve alertar ===========================
select is(
  (select gravidade from public.v_alertas_ativos
   where tipo = 'REVISÃO' and placa = 'BBB0002'), 'CRÍTICO',
  'Revisao vencida e CRITICO');

select is(
  (select gravidade from public.v_alertas_ativos
   where tipo = 'REVISÃO' and placa = 'AAA0001'), 'ATENÇÃO',
  'Revisao a 500 km e so ATENCAO');

select is(
  (select count(*) from public.v_alertas_ativos
   where tipo = 'ROTEIRO' and placa = 'CCC0003')::int, 1,
  'Roteiro aberto de dia anterior vira alerta');

select is(
  (select detalhe from public.v_alertas_ativos
   where tipo = 'PARADO' and placa = 'HHH0008'), 'sem roteiro há 12 dias',
  'Veiculo que rodava e parou ha 12 dias vira alerta, com a contagem certa');

-- ============================ o que deve calar =============================
select is(
  (select count(*) from public.v_alertas_ativos where placa = 'EEE0005')::int, 0,
  'Veiculo que rodou hoje nao gera alerta nenhum');

select is(
  (select count(*) from public.v_alertas_ativos where placa = 'FFF0006')::int, 0,
  'Veiculo em manutencao nao entra como parado (o motivo ja e conhecido)');

-- o caso que quebraria a tela no dia seguinte ao reset dos dados de teste
select is(
  (select count(*) from public.v_alertas_ativos
   where tipo = 'PARADO' and placa = 'DDD0004')::int, 0,
  'Veiculo que NUNCA saiu nao e parado — e sem historico');

select is(
  (select count(*) from public.v_alertas_ativos where tipo = 'OCORRÊNCIA')::int, 1,
  'So a ocorrencia GRAVE e em aberto alerta (resolvida e leve calam)');

-- ===================== security_invoker: a view respeita a RLS =============
-- Bia e tecnica e nao tem roteiro nem ocorrencia dela. Sem security_invoker a
-- view rodaria como dono e ela veria os alertas da frota inteira.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is(
  (select count(*) from public.v_alertas_ativos
   where tipo in ('ROTEIRO', 'OCORRÊNCIA'))::int, 0,
  'Tecnica NAO enxerga alerta de roteiro nem de ocorrencia de outra pessoa');

select * from finish();
rollback;
