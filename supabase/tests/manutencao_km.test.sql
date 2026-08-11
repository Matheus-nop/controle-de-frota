-- 0010: trg_libera_veiculo, trg_km_roteiro e trg_km_checklist.
--
-- NAO COLE ESTE ARQUIVO NO SQL EDITOR DO SUPABASE. `plan`, `is` e `finish` sao
-- funcoes do pgTAP, que nao esta instalado la. Quem vai no SQL editor e a
-- MIGRATION (supabase/migrations/0010_manutencao_km.sql). Este arquivo roda com
-- `supabase test db`, ou num PG local (ver docs/handoff.md).
--
-- Par do supabase/tests/bloqueio_checklist.test.sql, que cobre o quarto gatilho.
--
-- QUEM RODA CADA PARTE IMPORTA, e nao e igual nos tres:
--
--   * `manutencoes` so o GESTOR escreve (0004_rls.sql), e o gestor tambem pode
--     escrever em `veiculos`. Entao no trg_libera_veiculo o `security definer`
--     e cinto-e-suspensorio, nao o que faz a coisa funcionar — e este teste NAO
--     prova que ele e necessario, porque nao e. Dito com todas as letras para
--     ninguem ler o arquivo e concluir o contrario.
--   * `roteiros` e `checklists` o TECNICO escreve, e tecnico NAO pode escrever
--     em `veiculos` (veiculos_update exige is_gestor()). Ali o `security
--     definer` e a diferenca entre o odometro andar e nao andar, e as assercoes
--     de km rodam como a tecnica de proposito.
--
-- O caso do km atrasado (KMA/KMC) e o que justifica o `greatest`: a fila offline
-- do PWA sincroniza quando o sinal volta, entao lancamento antigo chega DEPOIS
-- de lancamento novo. Sem `greatest` o odometro andaria para tras, e /roteiro/
-- saida passaria a recusar a proxima saida por "km menor que o do veiculo".

begin;
select plan(10);

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

insert into public.veiculos (id, placa, modelo, status, km_atual) values
  ('01010101-0101-0101-0101-010101010101', 'LIB0001', 'Strada',  'MANUTENCAO', 10000),
  ('02020202-0202-0202-0202-020202020202', 'CAN0002', 'Fiorino', 'MANUTENCAO', 20000),
  ('03030303-0303-0303-0303-030303030303', 'DUA0003', 'Scudo',   'MANUTENCAO', 30000),
  ('04040404-0404-0404-0404-040404040404', 'BLQ0004', 'Scudo',   'BLOQUEADO',  40000),
  ('05050505-0505-0505-0505-050505050505', 'KMR0005', 'Bongo',   'ATIVO',      50000),
  ('06060606-0606-0606-0606-060606060606', 'KMA0006', 'Bongo',   'ATIVO',      60000),
  ('07070707-0707-0707-0707-070707070707', 'KMC0007', 'Strada',  'ATIVO',      70000),
  ('08080808-0808-0808-0808-080808080808', 'SAI0008', 'Fiorino', 'ATIVO',      80000);

insert into public.manutencoes (id, veiculo_id, descricao_problema, status) values
  ('11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '01010101-0101-0101-0101-010101010101', 'Embreagem',  'ABERTA'),
  ('22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '02020202-0202-0202-0202-020202020202', 'Orcamento',  'ABERTA'),
  -- DUA0003 tem DUAS ordens: freio e ar. Concluir uma so nao devolve o carro.
  ('33333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '03030303-0303-0303-0303-030303030303', 'Freio',      'ABERTA'),
  ('33333333-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '03030303-0303-0303-0303-030303030303', 'Ar',         'EM EXECUÇÃO'),
  ('44444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '04040404-0404-0404-0404-040404040404', 'Revisao',    'ABERTA');

-- ================== trg_libera_veiculo (como o GESTOR) =====================
-- E o unico papel que pode fechar ordem de servico.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

update public.manutencoes set status = 'CONCLUÍDA'
 where id = '11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.manutencoes set status = 'CANCELADA'
 where id = '22222222-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
update public.manutencoes set status = 'CONCLUÍDA'
 where id = '33333333-aaaa-aaaa-aaaa-aaaaaaaaaaaa';   -- so a do freio
update public.manutencoes set status = 'CONCLUÍDA'
 where id = '44444444-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

select is(
  (select status from public.veiculos where placa = 'LIB0001'), 'ATIVO',
  'Ordem CONCLUIDA devolve o veiculo a operacao');

select is(
  (select status from public.veiculos where placa = 'CAN0002'), 'ATIVO',
  'Ordem CANCELADA tambem devolve (orcamento recusado, carro volta)');

select is(
  (select status from public.veiculos where placa = 'DUA0003'), 'MANUTENCAO',
  'Com outra ordem ainda aberta o veiculo NAO volta');

select is(
  (select status from public.veiculos where placa = 'BLQ0004'), 'BLOQUEADO',
  'Concluir ordem NAO desbloqueia quem estava BLOQUEADO por checklist');

-- e quando a ULTIMA ordem fecha, ai sim o carro volta
update public.manutencoes set status = 'CONCLUÍDA'
 where id = '33333333-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

select is(
  (select status from public.veiculos where placa = 'DUA0003'), 'ATIVO',
  'Fechada a ultima ordem aberta, o veiculo volta a operacao');

-- =================== trg_km_roteiro (como a TECNICA) =======================
-- Aqui o `security definer` e load-bearing: veiculos_update exige is_gestor().
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- fluxo real: /roteiro/saida insere sem chegada, /roteiro/chegada faz o update
insert into public.roteiros (id, veiculo_id, tecnico_saida_id, saida_em, km_saida) values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', '05050505-0505-0505-0505-050505050505',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '4 hours', 50000),
  -- SAI0008 sai e NAO volta: o km de saida nao pode virar odometro do veiculo,
  -- senao um hodometro digitado errado na saida contaminaria o cadastro antes
  -- de qualquer conferencia.
  ('a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8', '08080808-0808-0808-0808-080808080808',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '2 hours', 80100);

update public.roteiros
   set chegada_em = now(), km_chegada = 50300,
       tecnico_chegada_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
 where id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';

select is(
  (select km_atual from public.veiculos where placa = 'KMR0005'), 50300,
  'Chegada lancada por tecnico atualiza o km do veiculo (RLS nao engole)');

select is(
  (select km_atual from public.veiculos where placa = 'SAI0008'), 80000,
  'Roteiro so com saida nao mexe no km do veiculo');

-- a fila offline: roteiro de dias atras sincroniza agora, com km MENOR
insert into public.roteiros (veiculo_id, tecnico_saida_id, saida_em, km_saida,
                             tecnico_chegada_id, chegada_em, km_chegada) values
  ('06060606-0606-0606-0606-060606060606', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   now() - interval '3 days', 58800,
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', now() - interval '3 days' + interval '5 hours', 59000);

select is(
  (select km_atual from public.veiculos where placa = 'KMA0006'), 60000,
  'Roteiro atrasado com km menor NAO faz o odometro andar para tras');

-- ================== trg_km_checklist (como a TECNICA) ======================
insert into public.checklists (veiculo_id, tecnico_id, km_atual, itens, apto) values
  ('07070707-0707-0707-0707-070707070707', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   70400, '{"pneus":true}'::jsonb, true);

select is(
  (select km_atual from public.veiculos where placa = 'KMC0007'), 70400,
  'Checklist lancado por tecnico atualiza o km do veiculo');

insert into public.checklists (veiculo_id, tecnico_id, km_atual, itens, apto) values
  ('07070707-0707-0707-0707-070707070707', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   69000, '{"pneus":true}'::jsonb, true);

select is(
  (select km_atual from public.veiculos where placa = 'KMC0007'), 70400,
  'Checklist atrasado com km menor NAO faz o odometro andar para tras');

select * from finish();
rollback;
