-- Dois papéis novos: PCM e PONTO.
-- Revise antes de aplicar: supabase db push (ou cole no SQL editor do Supabase).
--
-- Até aqui o sistema tinha dois papéis, e todo mundo que não era gestor era
-- técnico. Duas áreas ficaram de fora:
--
--   PCM  — planejamento e controle de manutenção. Precisa abrir, acompanhar e
--          fechar manutenção da frota inteira, ver checklist (é de lá que sai
--          metade das ordens) e ver os alertas de revisão. Não mexe em roteiro.
--
--   PONTO — o time que confere a folha. Precisa LER o horário de saída e de
--          chegada dos roteiros para conciliar com a marcação de ponto. Só
--          leitura, e só roteiro: não abre manutenção, não cadastra veículo,
--          não lança nada.
--
-- Continua valendo: papel é do cadastro em `tecnicos` (nome nunca é texto
-- livre), e quem manda no dado é a RLS — a navegação em lib/supabase/middleware
-- só evita que a pessoa caia numa tela que não vai conseguir preencher.

-- ---------------------------------------------------------------------------
-- 1. O check do papel abre para quatro valores.
--    `tecnicos_papel_check` é o nome que o Postgres deu ao check inline de
--    0003_auth.sql; o `if exists` cobre o caso de já ter sido recriado à mão.
-- ---------------------------------------------------------------------------
alter table public.tecnicos drop constraint if exists tecnicos_papel_check;
alter table public.tecnicos add constraint tecnicos_papel_check
  check (papel in ('TECNICO', 'GESTOR', 'PCM', 'PONTO'));

-- ---------------------------------------------------------------------------
-- 2. `tem_papel('PCM','PONTO')` — o irmão de is_gestor() para os papéis novos.
--    Mesmas garantias: security definer para ler `tecnicos` sem cair na RLS da
--    própria tabela, search_path travado, stable.
--    is_gestor() fica como está: GESTOR e só. Quem manda em quem escreve
--    continua sendo uma pergunta de uma palavra.
-- ---------------------------------------------------------------------------
create or replace function public.tem_papel(variadic papeis text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tecnicos
    where user_id = auth.uid() and papel = any(papeis)
  )
$$;

grant execute on function public.tem_papel(variadic text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS — só o que muda. Cada política é derrubada e recriada inteira, porque
--    `alter policy` não aceita adicionar um `or` a um using existente.
-- ---------------------------------------------------------------------------

-- roteiros: PCM e PONTO leem tudo. Escrita segue exatamente como estava —
-- técnico no que é dele, gestor em tudo. PONTO não escreve em lugar nenhum.
drop policy if exists roteiros_select on public.roteiros;
create policy roteiros_select on public.roteiros
  for select to authenticated
  using (
    public.is_gestor()
    or public.tem_papel('PCM', 'PONTO')
    or tecnico_saida_id   = public.current_tecnico_id()
    or tecnico_chegada_id = public.current_tecnico_id()
  );

-- checklists: PCM lê os de todo mundo (é a origem da manutenção preventiva).
-- Não escreve: checklist é vistoria de quem dirige.
drop policy if exists checklists_select on public.checklists;
create policy checklists_select on public.checklists
  for select to authenticated
  using (
    public.is_gestor()
    or public.tem_papel('PCM')
    or tecnico_id = public.current_tecnico_id()
  );

-- manutencoes: PCM escreve. É o trabalho dele.
drop policy if exists manutencoes_insert on public.manutencoes;
create policy manutencoes_insert on public.manutencoes
  for insert to authenticated
  with check (public.is_gestor() or public.tem_papel('PCM'));

drop policy if exists manutencoes_update on public.manutencoes;
create policy manutencoes_update on public.manutencoes
  for update to authenticated
  using (public.is_gestor() or public.tem_papel('PCM'))
  with check (public.is_gestor() or public.tem_papel('PCM'));

-- veiculos: abrir manutenção põe o veículo em MANUTENÇÃO e concluir devolve
-- para ATIVO (gatilho trg_libera_veiculo). Sem update aqui, o PCM abriria a
-- ordem e o veículo continuaria aparecendo como disponível no painel.
-- Cadastrar e apagar veículo continua sendo só do gestor.
drop policy if exists veiculos_update on public.veiculos;
create policy veiculos_update on public.veiculos
  for update to authenticated
  using (public.is_gestor() or public.tem_papel('PCM'))
  with check (public.is_gestor() or public.tem_papel('PCM'));

-- ---------------------------------------------------------------------------
-- 4. A tela do PONTO, pronta na view: um roteiro por linha, com o horário já
--    no fuso de São Paulo. Sem km, sem custo — o time da folha não precisa e
--    não deve carregar o custo da frota junto.
--
--    security_invoker: quem consulta é quem manda. Um técnico que chamar esta
--    view vê só os roteiros dele, pela política de roteiros acima.
-- ---------------------------------------------------------------------------
create or replace view public.v_conferencia_ponto as
select r.id,
       dia_br(r.saida_em) as dia,
       v.placa,
       v.modelo,
       ts.nome as tecnico_saida,
       tc.nome as tecnico_chegada,
       (r.saida_em   at time zone 'America/Sao_Paulo')::time(0) as hora_saida,
       (r.chegada_em at time zone 'America/Sao_Paulo')::time(0) as hora_chegada,
       (extract(epoch from (r.chegada_em - r.saida_em)) / 60)::int as duracao_min,
       -- vira o dia: quem saiu 22h e voltou 2h marca ponto em dois dias
       case when r.chegada_em is not null
             and dia_br(r.chegada_em) > dia_br(r.saida_em)
            then true else false end as virou_o_dia,
       dia_br(r.chegada_em) as dia_chegada,
       r.chegada_em is null as em_aberto
from roteiros r
join veiculos v on v.id = r.veiculo_id
join tecnicos ts on ts.id = r.tecnico_saida_id
left join tecnicos tc on tc.id = r.tecnico_chegada_id;

alter view public.v_conferencia_ponto set (security_invoker = on);
grant select on public.v_conferencia_ponto to authenticated;
