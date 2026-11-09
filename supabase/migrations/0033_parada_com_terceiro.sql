-- Onde o veículo ficou quando não esteve com a gente.
-- Revise antes de aplicar: cole no SQL editor do Supabase.
--
-- O CASO
--
-- A Scudo passou de 25/08 a 13/10 e de 29/10 a 09/11 de 2026 na ITAVEMA,
-- em manutenção corretiva. Durante esse tempo a concessionária rodou com ela
-- em rodovia, para testar. Multa tirada nesses dias chega no nome da empresa, e
-- o condutor a indicar NÃO é ninguém da equipe — é quem estava com o veículo.
--
-- Sem registro, a defesa depende de alguém lembrar. Com registro, a data da
-- multa responde sozinha de quem o veículo estava.
--
-- O NOME
--
-- "Parada" é a palavra da equipe ("o veículo ficou parado na ITAVEMA"), e é a
-- da tabela. O ALERTA, porém, não pode se chamar PARADO: esse tipo já existe
-- desde a 0007 e quer dizer outra coisa — "rodava e parou de rodar há 7 dias",
-- que é sobre ociosidade. Daí o tipo novo ser COM TERCEIRO. Dois alertas com o
-- mesmo nome e sentidos diferentes seria o jeito mais rápido de a fila deixar
-- de ser lida.

-- ---------------------------------------------------------------------------
-- 1. A tabela.
--
--    `ate` nulo quer dizer "ainda está lá", igual a `chegada_em` nulo no
--    roteiro. É o que permite o alerta existir enquanto o veículo não volta.
--
--    `onde` e `motivo` são texto livre, como `oficina` em manutencoes: a casa
--    que fica com o veículo muda, e uma tabela de cadastro para duas linhas por
--    ano custaria uma tela que ninguém pediu. A regra de nome em FK vale para
--    PESSOA — e `registrado_por` é FK, como manda o CLAUDE.md.
-- ---------------------------------------------------------------------------
create table if not exists public.paradas (
  id uuid primary key default gen_random_uuid(),
  veiculo_id uuid not null references public.veiculos,
  de date not null,
  ate date,
  onde text not null,
  motivo text not null,
  observacao text,
  registrado_por uuid references public.tecnicos,
  registrado_em timestamptz not null default now()
);

-- Reaplicar não pode quebrar: as colunas entram uma a uma.
alter table public.paradas
  add column if not exists observacao     text,
  add column if not exists registrado_por uuid references public.tecnicos,
  add column if not exists registrado_em  timestamptz not null default now();

alter table public.paradas drop constraint if exists parada_coerente;
alter table public.paradas add constraint parada_coerente
  check (ate is null or ate >= de);

-- Duas paradas abertas no mesmo veículo seriam duas respostas para "onde ele
-- está agora". Mesmo remédio do `um_roteiro_aberto_por_veiculo` (0001).
create unique index if not exists uma_parada_aberta_por_veiculo
  on public.paradas (veiculo_id) where ate is null;

create index if not exists paradas_veiculo_de_idx on public.paradas (veiculo_id, de);

-- ---------------------------------------------------------------------------
-- 2. RLS.
--
--    Todo mundo LÊ: o técnico que não achar o veículo na lista merece saber que
--    ele está na concessionária, em vez de ir procurar no pátio.
--
--    Escreve gestor ou PCM — é o PCM que leva o veículo para a oficina e sabe
--    o dia em que ele saiu. Apagar é só do gestor: parada errada se corrige
--    editando, e apagar some com a prova de onde o veículo estava.
-- ---------------------------------------------------------------------------
alter table public.paradas enable row level security;
grant select, insert, update, delete on public.paradas to authenticated;

drop policy if exists paradas_select on public.paradas;
create policy paradas_select on public.paradas
  for select to authenticated using (true);

drop policy if exists paradas_insert on public.paradas;
create policy paradas_insert on public.paradas
  for insert to authenticated
  with check (public.is_gestor() or public.tem_papel('PCM'));

drop policy if exists paradas_update on public.paradas;
create policy paradas_update on public.paradas
  for update to authenticated
  using (public.is_gestor() or public.tem_papel('PCM'))
  with check (public.is_gestor() or public.tem_papel('PCM'));

drop policy if exists paradas_delete on public.paradas;
create policy paradas_delete on public.paradas
  for delete to authenticated using (public.is_gestor());

-- ---------------------------------------------------------------------------
-- 3. O alerta.
--
--    Entra em `v_alertas_ativos`, e NÃO na `v_alertas_com_ciencia` de
--    propósito. Duas razões:
--
--    a) ciência quer dizer "já vi, pode sumir da fila". Aqui não serve: o fato
--       é verdadeiro enquanto durar, e esconder um veículo que está na
--       concessionária é esconder justamente o que se quer lembrar. O alerta
--       some sozinho no dia em que `ate` passar.
--
--    b) a `v_alertas_com_ciencia` tem 200 linhas e sete ramos. Acrescentar o
--       oitavo exigiria reescrever a view inteira para mudar dez linhas, e o
--       risco de errar uma vírgula no meio dela é maior do que o ganho.
--
--    De quebra, o ramo some com o alerta PARADO ("sem roteiro há N dias")
--    enquanto a parada durar: o veículo está parado, sim, e a gente já sabe por
--    quê. Dois alertas dizendo o mesmo silêncio é ruído, e ruído ensina a
--    ignorar a tela.
--
--    `create or replace`: a lista de colunas é a mesma, na mesma ordem.
-- ---------------------------------------------------------------------------
create or replace view public.v_alertas_ativos as
select
  a.tipo, a.gravidade, a.ordem, a.veiculo_id, a.placa, a.modelo,
  a.titulo, a.detalhe, a.desde, a.referencia
from public.v_alertas_com_ciencia a
where a.ciencia_em is null
  and not (
    a.tipo = 'PARADO'
    and exists (
      select 1 from public.paradas p
       where p.veiculo_id = a.veiculo_id
         and p.de <= current_date
         and (p.ate is null or p.ate >= current_date)
    )
  )

union all

select
  'COM TERCEIRO'::text,
  'ATENÇÃO'::text,
  3,
  v.id,
  v.placa,
  v.modelo,
  ('Veículo com ' || p.onde)::text,
  (lower(p.motivo)
    || ' · desde ' || to_char(p.de, 'DD/MM')
    || case when p.ate is null
            then ', há ' || (current_date - p.de) || ' dia'
                 || case when current_date - p.de = 1 then '' else 's' end
            else ' até ' || to_char(p.ate, 'DD/MM') end
    || ' · multa deste período não é de condutor nosso')::text,
  p.de,
  ('parada:' || p.id)::text
from public.paradas p
join public.veiculos v on v.id = p.veiculo_id
where p.de <= current_date
  and (p.ate is null or p.ate >= current_date);

alter view public.v_alertas_ativos set (security_invoker = on);
grant select on public.v_alertas_ativos to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Os dois períodos da Scudo na ITAVEMA.
--
--    Escrito a partir do MODELO e não de um id: o id do veículo é outro em
--    cada banco, e a migração tem que rodar igual no de produção e num banco
--    novo. Mesmo jeito dos planos de manutenção (0020–0026).
--
--    O `not exists` deixa reaplicar sem duplicar — as migrações deste projeto
--    são coladas à mão, e colar duas vezes é questão de tempo.
-- ---------------------------------------------------------------------------
insert into public.paradas (veiculo_id, de, ate, onde, motivo, observacao)
select v.id, d.de, d.ate, 'ITAVEMA', 'MANUTENÇÃO CORRETIVA',
       'A concessionária rodou com o veículo em rodovia para testar. '
       || 'Multa tirada neste período é de condutor da ITAVEMA, não da equipe.'
from public.veiculos v
cross join (values (date '2026-08-25', date '2026-10-13'),
                   (date '2026-10-29', date '2026-11-09')) as d(de, ate)
where v.modelo ilike '%SCUDO%'
  and not exists (
    select 1 from public.paradas p where p.veiculo_id = v.id and p.de = d.de
  );
