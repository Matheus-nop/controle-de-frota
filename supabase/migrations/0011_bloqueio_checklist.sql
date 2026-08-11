-- trg_bloqueio_checklist versionado: checklist "não apto" tira o veículo de
-- operação, "apto" devolve.
-- Revise antes de aplicar: supabase db push (ou cole no SQL editor do Supabase).
--
-- ⚠️ AO CONTRÁRIO DA 0010, ESTA AINDA NÃO RODOU. E ela SOBRESCREVE um gatilho
-- que hoje funciona em produção — o `trg_bloqueio_checklist` existe desde a
-- Fase 5, criado à mão, e nunca esteve em migration nenhuma. Este arquivo é uma
-- reconstrução a partir do comportamento descrito no docs/handoff.md, não uma
-- cópia do que está lá.
--
-- ANTES DE COLAR, compare com o que o banco tem:
--
--   select tgname, pg_get_triggerdef(oid)
--     from pg_trigger
--    where not tgisinternal and tgrelid = 'public.checklists'::regclass;
--
-- Se a definição de lá divergir desta, o banco é a fonte de verdade e quem
-- muda é este arquivo. E se o gatilho de produção apontar para uma função com
-- outro nome, o `create trigger` abaixo o repontará para `bloqueio_checklist()`
-- e a função antiga fica órfã no schema — sem efeito, mas vale apagar depois.
--
-- ---------------------------------------------------------------------------
-- Por que `security definer` aqui é obrigatório, não estilo.
--
-- A política `veiculos_update` (0004_rls.sql) exige `is_gestor()`. Quem preenche
-- o checklist é o TÉCNICO. Sem `security definer` a RLS descartaria o UPDATE em
-- `veiculos` — e RLS não levanta erro no UPDATE, apenas não afeta a linha. O
-- resultado seria o pior tipo de falha: o técnico marca "não apto", a tela diz
-- que salvou, o checklist fica gravado com o motivo do bloqueio, e o veículo
-- continua ATIVO e disponível para a próxima saída. Silencioso.
--
-- `search_path = ''` é o par obrigatório disso: sem ele, um schema no caminho de
-- busca de quem dispara o gatilho poderia trocar por baixo qual `veiculos` é
-- atualizada — e a função roda com os direitos do dono.
--
-- Nada gravado que seja derivado: `status` é estado do veículo, o mesmo campo
-- que o gestor edita em /veiculos. O gatilho só reage à vistoria.
-- ---------------------------------------------------------------------------

create or replace function public.bloqueio_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.apto then
    -- "apto" devolve à operação — mas só quem a vistoria tinha tirado dela.
    -- Sem o `status = 'BLOQUEADO'`, uma vistoria aprovada puxaria o veículo
    -- para fora da oficina (MANUTENCAO) e ressuscitaria VENDIDO. Vistoria em
    -- dia não é ordem de serviço concluída: quem devolve veículo da oficina é
    -- o trg_libera_veiculo (0010), quando a OS fecha.
    update public.veiculos
       set status = 'ATIVO'
     where id = new.veiculo_id
       and status = 'BLOQUEADO';
  else
    -- "não apto" bloqueia só quem estava rodando. Veículo já em MANUTENCAO
    -- continua em MANUTENCAO: trocar para BLOQUEADO apagaria da tela o fato de
    -- que ele está na oficina, com OS aberta e oficina identificada — que é
    -- mais informação, não menos.
    update public.veiculos
       set status = 'BLOQUEADO'
     where id = new.veiculo_id
       and status = 'ATIVO';
  end if;
  return null;
end;
$$;

-- `update of apto` e não `update`: o gatilho só precisa acordar quando o
-- veredito muda. Corrigir a descrição ou anexar foto não mexe no veículo.
-- (`apto` é `not null` no schema, então não há terceiro caso a tratar.)
drop trigger if exists trg_bloqueio_checklist on public.checklists;
create trigger trg_bloqueio_checklist
  after insert or update of apto on public.checklists
  for each row execute function public.bloqueio_checklist();

-- Convivência com o trg_km_checklist (0010): os dois são AFTER na mesma tabela,
-- e o Postgres dispara em ordem alfabética de nome — bloqueio antes de km. Um
-- mexe em `status`, o outro em `km_atual`: colunas diferentes, sem disputa.
