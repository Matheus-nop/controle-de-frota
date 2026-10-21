-- Corrigir o km de um roteiro, com rastro.
-- Revise antes de aplicar: cole no SQL editor do Supabase.
--
-- O CASO, visto em produção: a Strada saiu com "2012 km" quando o hodômetro
-- marcava 212. O técnico digitou um dígito a mais. A chegada passou a ser
-- impossível — o banco recusa chegada menor que saída, com razão — e o veículo
-- ficou "NA RUA" no painel, sem jeito de fechar pelo app.
--
-- Até aqui a saída de emergência era SQL na mão, que é exatamente o que este
-- sistema existe para acabar. Agora o gestor corrige em /historico.
--
-- O que NÃO muda: a RLS. `roteiros_update` já era "gestor, ou o técnico do
-- próprio roteiro" (0004) — a correção entra por essa porta e nenhuma política
-- nova é criada. O PCM continua de fora do roteiro, como diz o CLAUDE.md.

-- ---------------------------------------------------------------------------
-- 1. O rastro.
--
--    Mesma forma do rastro da vistoria (`checklists.itens.correcoes`): uma
--    lista que só cresce, com o que era, o que passou a ser, quem trocou e
--    quando. Aqui é coluna própria porque `roteiros` não tem um jsonb onde
--    pendurar — e a tela do histórico lê as duas com o mesmo leitor.
--
--    Sem o rastro, "o veículo rodou 212 km" e "alguém DISSE depois que foram
--    212 km" viram a mesma frase para quem olhar daqui a seis meses. Não são a
--    mesma coisa numa conversa sobre combustível.
-- ---------------------------------------------------------------------------
alter table public.roteiros
  add column if not exists correcoes jsonb not null default '[]'::jsonb;

alter table public.roteiros drop constraint if exists correcoes_e_lista;
alter table public.roteiros add constraint correcoes_e_lista
  check (jsonb_typeof(correcoes) = 'array');

-- ---------------------------------------------------------------------------
-- 2. v_roteiros tem que enxergar a coluna nova.
--
--    O corpo da view é `select r.*`, mas view guarda a LISTA de colunas de
--    quando foi criada: sem recriar, `correcoes` não apareceria e a tela do
--    histórico (que lê a view) nunca mostraria o rastro.
--
--    `drop` em vez de `create or replace` pelo mesmo motivo da 0010: o replace
--    recusa mudança na lista de colunas. Os grants e o `security_invoker` são
--    refeitos logo abaixo — sem eles a view voltaria a rodar como dono e
--    entregaria a frota inteira ao técnico.
--
--    O corpo abaixo é o da 0010, sem uma vírgula de diferença.
-- ---------------------------------------------------------------------------
drop view if exists public.v_roteiros;

create view public.v_roteiros as
select r.*, v.placa, v.modelo, v.custo_km,
       ts.nome as tecnico_saida, tc.nome as tecnico_chegada,
       tv.nome as km_verificado_nome,
       round(r.km_rodado * v.custo_km, 2) as custo_roteiro,
       (r.saida_em   at time zone 'America/Sao_Paulo')::time(0) as hora_saida,
       (r.chegada_em at time zone 'America/Sao_Paulo')::time(0) as hora_chegada,
       (extract(epoch from (r.chegada_em - r.saida_em)) / 60)::int as duracao_min,
       case
         when r.chegada_em is null and dia_br(r.saida_em) = hoje_br() then 'NA RUA'
         when r.chegada_em is null then 'SEM FECHAMENTO'
         when r.km_rodado > 600 and r.km_verificado_em is null
           then 'CONCLUÍDO - KM ALTO VERIFICAR'
         when dia_br(r.chegada_em) > dia_br(r.saida_em) then 'CONCLUÍDO - DIA SEGUINTE'
         else 'CONCLUÍDO'
       end as situacao
from roteiros r
join veiculos v on v.id = r.veiculo_id
join tecnicos ts on ts.id = r.tecnico_saida_id
left join tecnicos tc on tc.id = r.tecnico_chegada_id
left join tecnicos tv on tv.id = r.km_verificado_por;

alter view public.v_roteiros set (security_invoker = on);
grant select on public.v_roteiros to authenticated;
