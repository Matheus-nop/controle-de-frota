-- Prova da migração 0027: agendamento, saldo do pacote e os alertas novos.
-- Roda com: supabase test db   (carrega pgTAP e aplica as migrations antes).
--
-- A regra do CLAUDE.md: "Politica nova exige teste que prove o bloqueio."
-- O que precisa ficar provado aqui, porque e onde da errado:
--   * o saldo e CONTAGEM, nao contador: manutencao CANCELADA nao consome
--     revisao, e nenhum numero precisa ser decrementado na mao.
--   * a ciencia vale para o ciclo atual e so: a referencia carrega quantas
--     revisoes ja foram usadas, entao usar uma faz o alerta da proxima
--     aparecer limpo em vez de ficar calado para sempre.
--   * o alerta de agendada some sozinho quando a manutencao deixa de estar
--     agendada — sem ninguem precisar dar ciencia.
--   * tecnico LE pacote e nao escreve; gestor e PCM escrevem. O teste so vale
--     se o gestor PASSAR no mesmo lugar em que o tecnico APANHA: senao estaria
--     provando que ninguem consegue, e nao que a politica separa os papeis.

begin;
select plan(16);

-- ========================= fixtures (como dono) ============================
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
values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'SRT9D86', 'FIAT FIORINO', 'ATIVO', 84000);

-- Pacote: 6 revisoes gratuitas, a cada 10.000 km ou 60 dias, contratado aos
-- 70.000 km e ha 200 dias.
insert into public.pacotes_revisao
  (id, veiculo_id, prestador, servico, contratado_em, km_contratado,
   revisoes_gratuitas, cada_km, cada_dias, vence_em, criado_por)
values ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
        'FULL PNEUS', 'ALINHAMENTO E BALANCEAMENTO', current_date - 200, 70000,
        6, 10000, 60, current_date + 165, 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2');

-- Duas usadas de verdade e UMA CANCELADA, que nao pode consumir.
insert into public.manutencoes
  (veiculo_id, descricao_problema, pacote_id, status, km_abertura, concluida_em)
values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', '1a gratuita', 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'CONCLUÍDA', 75000, current_date - 120),
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', '2a gratuita', 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'CONCLUÍDA', 79000, current_date - 70),
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'remarcada',   'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'CANCELADA', 81000, null);

-- ========================= o saldo e contagem ==============================
select is((select usadas    from public.v_pacotes_revisao where id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'),
          2, 'a CANCELADA nao consome: 2 usadas, nao 3');
select is((select restantes from public.v_pacotes_revisao where id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'),
          4, 'sobram 4 das 6 gratuitas');
select is((select ultimo_km from public.v_pacotes_revisao where id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'),
          79000, 'o km da ultima ignora a cancelada (79.000, nao 81.000)');
select is((select proxima_km from public.v_pacotes_revisao where id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'),
          89000, 'a proxima prevista conta da ultima usada: 79.000 + 10.000');
select is((select proxima_em from public.v_pacotes_revisao where id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'),
          current_date - 10, 'a proxima por data venceu ha 10 dias');

-- ===================== o alerta da gratuita aparece ========================
select is((select count(*) from public.v_alertas_ativos
            where tipo = 'REVISÃO GRATUITA' and veiculo_id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1'),
          1::bigint, 'pacote com saldo e prazo vencido entra na fila de alertas');
select is((select referencia from public.v_alertas_ativos where tipo = 'REVISÃO GRATUITA'),
          'pacote:b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1:2',
          'a referencia carrega quantas ja foram usadas');

-- ================= a ciencia cala o ciclo atual, e so ele ==================
insert into public.alertas_ciencia (tipo, veiculo_id, referencia, por)
values ('REVISÃO GRATUITA', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
        'pacote:b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1:2', 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2');

select is((select count(*) from public.v_alertas_ativos where tipo = 'REVISÃO GRATUITA'),
          0::bigint, 'dada a ciencia, o alerta sai da fila');

-- usa a 3a: a referencia muda, e o prazo recomeca
insert into public.manutencoes
  (veiculo_id, descricao_problema, pacote_id, status, km_abertura, concluida_em)
values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', '3a gratuita',
        'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'CONCLUÍDA', 84000, current_date - 1);

select is((select restantes from public.v_pacotes_revisao where id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'),
          3, 'usada a 3a, sobram 3');
select is((select count(*) from public.v_alertas_ativos where tipo = 'REVISÃO GRATUITA'),
          0::bigint, 'logo depois de usar, a proxima ainda nao venceu — nada na fila');

-- o hodometro passa dos 94.000: a proxima vence e o alerta volta, apesar da
-- ciencia antiga, porque a referencia agora termina em :3
update public.veiculos set km_atual = 95000 where id = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';

select is((select referencia from public.v_alertas_ativos where tipo = 'REVISÃO GRATUITA'),
          'pacote:b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1:3',
          'ciclo novo, referencia nova: a ciencia antiga nao cala o alerta de agora');

-- ========================= o alerta de agendada ============================
insert into public.manutencoes (id, veiculo_id, descricao_problema, oficina, status, agendada_para)
values ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
        'Alinhamento', 'FULL PNEUS', 'AGENDADA', current_date + 3),
       ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
        'Revisao distante', 'FULL PNEUS', 'AGENDADA', current_date + 30);

select is((select count(*) from public.v_alertas_ativos where tipo = 'AGENDADA'),
          1::bigint, 'so a agendada dentro de 7 dias alerta; a de 30 dias fica quieta');
select is((select gravidade from public.v_alertas_ativos where tipo = 'AGENDADA'),
          'ATENÇÃO', 'agendada que ainda vai acontecer e ATENCAO');

update public.manutencoes set agendada_para = current_date - 2
 where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
select is((select gravidade from public.v_alertas_ativos where tipo = 'AGENDADA'),
          'CRÍTICO', 'agendada que passou da data e CRITICO');

update public.manutencoes set status = 'ABERTA'
 where id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
select is((select count(*) from public.v_alertas_ativos where tipo = 'AGENDADA'),
          0::bigint, 'aberta a manutencao, o alerta some sozinho — sem precisar de ciencia');

-- ============================ RLS do pacote ================================
-- TECNICO: le e so.
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ insert into public.pacotes_revisao (veiculo_id, prestador, servico, revisoes_gratuitas)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'X', 'Y', 3) $$,
  '42501',
  'TECNICO nao cadastra pacote de revisao');

-- GESTOR: o mesmo insert tem que PASSAR, senao o teste acima nao provou nada.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.pacotes_revisao (veiculo_id, prestador, servico, revisoes_gratuitas)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'TESTE GESTOR', 'ALINHAMENTO', 2) $$,
  'GESTOR cadastra pacote — e o que prova que o bloqueio do tecnico e da politica');

-- PCM tambem, que e quem toca manutencao no dia a dia.
reset role;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.pacotes_revisao (veiculo_id, prestador, servico, revisoes_gratuitas)
     values ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'TESTE PCM', 'ALINHAMENTO', 2) $$,
  'PCM cadastra pacote');

reset role;
select * from finish();
rollback;
