-- trg_bloqueio_checklist (0011): a vistoria tira o veiculo de operacao e o
-- devolve — sem atropelar quem esta na oficina ou ja foi vendido.
--
-- NAO COLE ESTE ARQUIVO NO SQL EDITOR DO SUPABASE. `plan`, `is` e `finish` sao
-- funcoes do pgTAP, que nao esta instalado la — o editor responde "function
-- plan(integer) does not exist". Quem vai no SQL editor e a MIGRATION
-- (supabase/migrations/0011_bloqueio_checklist.sql). Este arquivo roda com
-- `supabase test db`, ou num PG local (ver docs/handoff.md).
--
-- Duas coisas sao provadas aqui, e a primeira e a que importa:
--
-- 1. O BLOQUEIO ACONTECE QUANDO QUEM VISTORIA E O TECNICO. A politica
--    `veiculos_update` (0004_rls.sql) exige `is_gestor()`, e quem preenche o
--    checklist e o tecnico. Sem `security definer` na funcao do gatilho, a RLS
--    descarta o UPDATE em `veiculos` — e RLS NAO levanta erro no UPDATE, apenas
--    nao afeta a linha. A falha seria muda: a tela diz que salvou, o checklist
--    fica gravado com o motivo do bloqueio, e o veiculo continua ATIVO e
--    disponivel para a proxima saida. Por isso todo caso abaixo roda como a
--    tecnica Ana, nao como dono nem como gestor: rodando como dono o teste
--    passaria mesmo com o gatilho quebrado.
--
-- 2. AS GUARDAS DE STATUS. "apto" so devolve a operacao quem a propria vistoria
--    tinha tirado dela (BLOQUEADO). Sem isso, vistoria aprovada puxaria o
--    veiculo para fora da oficina e ressuscitaria VENDIDO. Pela UI isso nao
--    acontece — /checklist so lista ATIVO e BLOQUEADO — mas a UI nao e a
--    fronteira do banco: migracao, correcao por SQL e script futuro passam por
--    fora dela. A guarda mora aqui.

begin;
select plan(8);

-- ========================= fixtures (como dono) ============================
insert into auth.users (instance_id, id, aud, role, email,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ana@frota.test',    '', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'gestor@frota.test', '', now(), now(), now());

insert into public.tecnicos (id, user_id, nome, papel) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'Ana',    'TECNICO'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '33333333-3333-3333-3333-333333333333', 'Gestor', 'GESTOR');

-- Um veiculo por transicao. Placa nomeia o caso para a falha se ler sozinha.
insert into public.veiculos (id, placa, modelo, status, km_atual) values
  ('01010101-0101-0101-0101-010101010101', 'NAP0001', 'Strada',  'ATIVO',      10000),
  ('02020202-0202-0202-0202-020202020202', 'APT0002', 'Fiorino', 'BLOQUEADO',  20000),
  ('03030303-0303-0303-0303-030303030303', 'OFI0003', 'Scudo',   'MANUTENCAO', 30000),
  ('04040404-0404-0404-0404-040404040404', 'VND0004', 'Scudo',   'VENDIDO',    40000),
  ('05050505-0505-0505-0505-050505050505', 'OFI0005', 'Bongo',   'MANUTENCAO', 50000),
  ('06060606-0606-0606-0606-060606060606', 'VND0006', 'Bongo',   'VENDIDO',    60000);

-- ===================== a partir daqui a RLS vale ==========================
-- Como a TECNICA. E o ponto do teste: e o papel que NAO pode escrever em
-- `veiculos` por conta propria.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.checklists (id, veiculo_id, tecnico_id, km_atual, itens, apto, motivo_bloqueio) values
  -- o caso central: vistoria reprovada tira o veiculo de circulacao
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', '01010101-0101-0101-0101-010101010101',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 10500, '{"pneus":false}'::jsonb, false, 'Pneu dianteiro careca'),
  -- vistoria aprovada devolve quem a vistoria tinha bloqueado
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', '02020202-0202-0202-0202-020202020202',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 20100, '{"pneus":true}'::jsonb,  true,  null),
  -- ...mas nao quem esta na oficina
  ('c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3', '03030303-0303-0303-0303-030303030303',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 30100, '{"pneus":true}'::jsonb,  true,  null),
  -- ...nem quem foi vendido
  ('c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4', '04040404-0404-0404-0404-040404040404',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 40100, '{"pneus":true}'::jsonb,  true,  null),
  -- reprovar quem ja esta na oficina nao pode apagar o fato de estar la
  ('c5c5c5c5-c5c5-c5c5-c5c5-c5c5c5c5c5c5', '05050505-0505-0505-0505-050505050505',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 50100, '{"pneus":false}'::jsonb, false, 'Freio'),
  -- nem trazer de volta o que foi vendido
  ('c6c6c6c6-c6c6-c6c6-c6c6-c6c6c6c6c6c6', '06060606-0606-0606-0606-060606060606',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 60100, '{"pneus":false}'::jsonb, false, 'Freio');

-- ============================ o bloqueio ===================================
-- Se esta falhar com 'ATIVO', a funcao do gatilho perdeu o `security definer`:
-- a RLS engoliu o UPDATE sem reclamar.
select is(
  (select status from public.veiculos where placa = 'NAP0001'), 'BLOQUEADO',
  'Checklist NAO APTO de tecnico bloqueia o veiculo (RLS nao engole o UPDATE)');

select is(
  (select status from public.veiculos where placa = 'APT0002'), 'ATIVO',
  'Checklist APTO devolve a operacao quem estava BLOQUEADO');

-- ============================== as guardas =================================
select is(
  (select status from public.veiculos where placa = 'OFI0003'), 'MANUTENCAO',
  'Checklist APTO NAO tira da oficina quem esta em MANUTENCAO');

select is(
  (select status from public.veiculos where placa = 'VND0004'), 'VENDIDO',
  'Checklist APTO NAO ressuscita veiculo VENDIDO');

select is(
  (select status from public.veiculos where placa = 'OFI0005'), 'MANUTENCAO',
  'Checklist NAO APTO deixa em MANUTENCAO quem ja estava (nao vira BLOQUEADO)');

select is(
  (select status from public.veiculos where placa = 'VND0006'), 'VENDIDO',
  'Checklist NAO APTO nao mexe em veiculo VENDIDO');

-- ===================== convivencia com o trg_km_checklist ==================
-- Os dois sao AFTER na mesma tabela e o Postgres dispara em ordem alfabetica de
-- nome (bloqueio antes de km). Colunas diferentes, entao o mesmo insert tem de
-- deixar as duas em dia — se um dia um deles virar BEFORE e mexer em NEW, esta
-- assercao e a que acusa.
select is(
  (select km_atual from public.veiculos where placa = 'NAP0001'), 10500,
  'O mesmo checklist que bloqueou tambem atualizou o km_atual do veiculo');

-- ========================= correcao pelo gestor ============================
-- `update of apto`: a vistoria foi lancada errada e o gestor corrige o veredito
-- (checklists_update exige is_gestor(), entao a correcao e mesmo dele). O
-- veiculo tem de voltar — senao a unica saida seria editar o status na mao em
-- /veiculos, que e o trabalho que o gatilho existe para evitar.
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

update public.checklists
   set apto = true, motivo_bloqueio = null
 where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';

select is(
  (select status from public.veiculos where placa = 'NAP0001'), 'ATIVO',
  'Gestor corrigindo o veredito para APTO devolve o veiculo a operacao');

select * from finish();
rollback;
