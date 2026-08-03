-- roteiros_quarentena: prova que so o gestor enxerga.
-- Roda com: supabase test db
--
-- A regra do CLAUDE.md: "Politica nova exige teste que prove o bloqueio."
--
-- O risco especifico desta tabela: ela guarda o texto BRUTO da planilha, com
-- nome de todo mundo, inclusive em linhas que nunca foram resolvidas. Se a
-- politica falhar aberta, um tecnico passa a ler o historico da frota inteira
-- — justamente o que a RLS de `roteiros` impede na tabela ao lado.

begin;
select plan(4);

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

insert into public.veiculos (id, placa, modelo) values
  ('d1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1', 'TEST0001', 'Fiat Strada');

-- uma linha que e da propria Ana: nem essa ela pode ver
insert into public.roteiros_quarentena
  (linha_origem, veiculo_id, tecnico_saida_id, tecnico_saida_bruto, km_saida, motivos)
values
  ('LINHA-1', 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'ANA', 1000,
   array['sem chegada (roteiro aberto)']);

set local role authenticated;

-- ---- como Ana (tecnica) ----
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select is(
  (select count(*) from public.roteiros_quarentena)::int, 0,
  'Tecnica NAO enxerga a quarentena, nem a linha que e dela');

select throws_ok(
  $$ insert into public.roteiros_quarentena (linha_origem, km_saida, motivos)
     values ('LINHA-X', 1, array['teste']) $$,
  '42501',
  'Tecnica NAO consegue inserir na quarentena');

-- ---- como Gestor ----
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

select is(
  (select count(*) from public.roteiros_quarentena)::int, 1,
  'Gestor enxerga a quarentena');

select is(
  (with u as (
     update public.roteiros_quarentena
        set resolvido = true, resolucao = 'promovido para roteiros'
      where linha_origem = 'LINHA-1'
      returning 1)
   select count(*) from u)::int, 1,
  'Gestor consegue marcar como resolvido');

select * from finish();
rollback;
