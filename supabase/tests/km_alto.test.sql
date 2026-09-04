-- Prova das tres faixas de km da migration 0010.
-- Roda com: supabase test db
--
-- O caso real que motivou tudo: roteiro para Minas, 1.827 km, recusado pelo
-- app. O teste amarra as duas pontas — a viagem longa PASSA e nasce marcada
-- para conferencia; a digitacao errada continua BARRADA.

begin;
select plan(6);

insert into public.veiculos (id, placa, modelo, status)
values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'TEST0001', 'Scudo', 'ATIVO');

insert into auth.users (instance_id, id, aud, role, email,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000',
        '33333333-3333-3333-3333-333333333333',
        'authenticated', 'authenticated', 'gestor@frota.test', '', now(), now(), now());

insert into public.tecnicos (id, user_id, nome, papel) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '33333333-3333-3333-3333-333333333333', 'Gestor', 'GESTOR');

-- ---- faixa 1: roteiro normal ----
insert into public.roteiros (id, veiculo_id, tecnico_saida_id, saida_em, km_saida,
                             chegada_em, km_chegada)
values ('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a',
        'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        now() - interval '8 hours', 1000, now(), 1180);

select is(
  (select situacao from public.v_roteiros where id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  'CONCLUÍDO',
  '180 km e roteiro comum');

-- ---- faixa 2: a viagem para Minas ----
insert into public.roteiros (id, veiculo_id, tecnico_saida_id, saida_em, km_saida,
                             chegada_em, km_chegada)
values ('0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b',
        'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        now() - interval '30 hours', 2000, now() - interval '2 hours', 3827);

select is(
  (select situacao from public.v_roteiros where id = '0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b'),
  'CONCLUÍDO - KM ALTO VERIFICAR',
  '1.827 km entra — marcado para o gestor conferir, nao recusado');

select is(
  (select km_rodado from public.roteiros where id = '0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b'),
  1827,
  'o km rodado e o de verdade, nao um valor aparado');

-- conferido pelo gestor: sai da fila de pendencia
update public.roteiros
   set km_verificado_em = now(), km_verificado_por = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
 where id = '0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b';

select is(
  (select situacao from public.v_roteiros where id = '0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b'),
  'CONCLUÍDO - DIA SEGUINTE',
  'depois de conferido para de pedir conferencia');

-- ---- faixa 3: o hodometro no lugar do km ----
select throws_ok(
  $$ insert into public.roteiros (veiculo_id, tecnico_saida_id, saida_em, km_saida,
                                  chegada_em, km_chegada)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
             'cccccccc-cccc-cccc-cccc-cccccccccccc',
             now() - interval '5 hours', 3000, now(), 36176) $$,
  '23514',
  '33.176 km num roteiro e digitacao errada — continua barrado');

-- ---- e o basico que nunca pode passar ----
select throws_ok(
  $$ insert into public.roteiros (veiculo_id, tecnico_saida_id, saida_em, km_saida,
                                  chegada_em, km_chegada)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
             'cccccccc-cccc-cccc-cccc-cccccccccccc',
             now() - interval '5 hours', 3000, now(), 2900) $$,
  '23514',
  'chegada com km menor que a saida continua impossivel');

select * from finish();
rollback;
