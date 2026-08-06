-- Fuso horario (0009): prova que as views datam pelo relogio de Sao Paulo.
--
-- NAO COLE ESTE ARQUIVO NO SQL EDITOR DO SUPABASE. `plan`, `is` e `finish` sao
-- funcoes do pgTAP, que nao esta instalado la — o editor responde "function
-- plan(integer) does not exist". Quem vai no SQL editor e a MIGRATION
-- (supabase/migrations/0009_fuso_horario.sql). Este arquivo roda com
-- `supabase test db`, ou num PG local (ver docs/handoff.md).
--
-- O banco guarda instante (timestamptz). "Em que DIA isso aconteceu?" so tem
-- resposta com um fuso, e o fuso da sessao no Supabase e UTC. Entre 21h e a
-- meia-noite os dois discordam, e e exatamente a hora em que a equipe fecha
-- roteiro. Todo caso abaixo mora nessa janela — fora dela nada disto falha,
-- que e o motivo do bug ter durado tanto.
--
-- Os dois casos de virada (TAR e VIR) usam data fixa (10/03) de proposito:
-- provam a correcao a QUALQUER hora em que o teste rodar. Os casos que falam
-- de "hoje" (NOI e MAN) so separam a view certa da errada em parte do dia —
-- NOI de 00h as 21h, MAN das 21h a meia-noite. Juntos cobrem as 24 horas, mas
-- nenhum deles sozinho e prova; por isso os quatro estao aqui.

begin;
select plan(8);

-- ========================= fixtures (como dono) ============================
insert into auth.users (instance_id, id, aud, role, email,
                        encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000',
   '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'ana@frota.test', '', now(), now(), now());

insert into public.tecnicos (id, user_id, nome, papel) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111', 'Ana', 'TECNICO');

-- proxima_revisao_km bem longe: aqui so interessa o alerta de ROTEIRO, e um
-- alerta de revisao no meio so atrapalharia a leitura da falha.
insert into public.veiculos (id, placa, modelo, status, km_atual, proxima_revisao_km) values
  ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'NOI0022', 'Strada',  'ATIVO', 10000, 900000),
  ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'TAR0020', 'Fiorino', 'ATIVO', 20000, 900000),
  ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3', 'VIR0022', 'Scudo',   'ATIVO', 30000, 900000),
  ('e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4', 'MAN0008', 'Bongo',   'ATIVO', 40000, 900000),
  ('e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5', 'ESQ0001', 'Bongo',   'ATIVO', 50000, 900000);

insert into public.roteiros (veiculo_id, tecnico_saida_id, saida_em, km_saida, chegada_em, km_chegada) values
  -- NOI: saiu HOJE as 22h e ainda esta na rua.
  -- Em UTC ja e o dia seguinte: a view antiga o chamava de "SEM FECHAMENTO"
  -- (alerta CRITICO) todo dia a partir das 21h.
  ('e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   (public.hoje_br() + time '22:00') at time zone 'America/Sao_Paulo', 10000, null, null),

  -- TAR: saiu 20h e voltou 23h do MESMO dia.
  -- Em UTC a chegada cai no dia seguinte -> "CONCLUÍDO - DIA SEGUINTE" errado.
  ('e2e2e2e2-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   timestamp '2026-03-10 20:00' at time zone 'America/Sao_Paulo', 20000,
   timestamp '2026-03-10 23:00' at time zone 'America/Sao_Paulo', 20080),

  -- VIR: saiu 22h e voltou 2h — virada de verdade.
  -- Em UTC os dois instantes caem no MESMO dia, entao a view antiga calava
  -- justamente no caso que a coluna existe para mostrar.
  ('e3e3e3e3-e3e3-e3e3-e3e3-e3e3e3e3e3e3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   timestamp '2026-03-10 22:00' at time zone 'America/Sao_Paulo', 30000,
   timestamp '2026-03-11 02:00' at time zone 'America/Sao_Paulo', 30150),

  -- MAN: saiu HOJE as 8h e ainda esta na rua. Das 21h em diante o UTC ja
  -- virou o dia e a view antiga o acusava de nao ter fechado o roteiro de
  -- ontem — o falso positivo que enchia /alertas toda noite.
  ('e4e4e4e4-e4e4-e4e4-e4e4-e4e4e4e4e4e4', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   (public.hoje_br() + time '08:00') at time zone 'America/Sao_Paulo', 40000, null, null),

  -- ESQ: esqueceu de fechar ha tres dias. O alerta tem de continuar existindo:
  -- corrigir falso positivo calando o alerta inteiro seria o pior desfecho.
  ('e5e5e5e5-e5e5-e5e5-e5e5-e5e5e5e5e5e5', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   (public.hoje_br() - 3 + time '22:00') at time zone 'America/Sao_Paulo', 50000, null, null);

-- ============================== os helpers =================================
select is(
  public.dia_br(timestamp '2026-03-10 22:00' at time zone 'America/Sao_Paulo'),
  date '2026-03-10',
  'dia_br() devolve o dia daqui, nao o de Greenwich');

select is(
  public.dia_br(timestamptz '2026-03-11T01:00:00Z'),
  date '2026-03-10',
  'dia_br() de 01h UTC ainda e o dia anterior aqui');

select is(
  public.hoje_br(),
  (now() at time zone 'America/Sao_Paulo')::date,
  'hoje_br() e o dia de hoje em Sao Paulo');

-- ========================= v_roteiros.situacao ==============================
select is(
  (select situacao from public.v_roteiros where placa = 'NOI0022'), 'NA RUA',
  'Roteiro aberto que saiu hoje as 22h esta NA RUA, nao sem fechamento');

select is(
  (select situacao from public.v_roteiros where placa = 'TAR0020'), 'CONCLUÍDO',
  'Saiu 20h e voltou 23h do mesmo dia nao virou o dia');

select is(
  (select situacao from public.v_roteiros where placa = 'VIR0022'),
  'CONCLUÍDO - DIA SEGUINTE',
  'Saiu 22h e voltou 2h virou o dia de verdade');

-- ========================= v_alertas_ativos =================================
-- O falso positivo diario: das 21h em diante o UTC ja virou o dia, e todo
-- veiculo que saiu de manha e ainda estava na rua era acusado de nao ter
-- fechado o roteiro do dia anterior. CRITICO, na cara do gestor, todo dia.
select is(
  (select count(*) from public.v_alertas_ativos
   where tipo = 'ROTEIRO' and placa = 'MAN0008')::int, 0,
  'Veiculo que saiu hoje de manha e ainda esta na rua nao e sem fechamento');

-- E o alerta continua funcionando para quem realmente esqueceu de fechar.
select is(
  (select count(*) from public.v_alertas_ativos
   where tipo = 'ROTEIRO' and placa = 'ESQ0001')::int, 1,
  'Roteiro aberto de tres dias atras continua alertando');

select * from finish();
rollback;
