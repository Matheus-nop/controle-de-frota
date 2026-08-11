-- Manutenção que devolve o veículo, e km_atual que não fica para trás.
-- Revise antes de aplicar: supabase db push (ou cole no SQL editor do Supabase).
--
-- ATENÇÃO — esta migration JÁ FOI APLICADA em produção, à mão. O arquivo existe
-- para o repositório parar de mentir sobre o que tem no banco: quem clonar e
-- rodar as migrations em ordem tem que chegar no mesmo estado. Rodar de novo no
-- banco que já a recebeu não faz nada — tudo aqui é idempotente.
--
-- Numerada 0010 e não 0008: o 0008 é o `roteiros_quarentena` e o 0009 é o fuso
-- horário (aplicado em 2026-08-06). Esta veio depois dos dois.
--
-- Os dois problemas que ela fecha:
--
-- 1. Veículo entrava em MANUTENCAO e nunca mais saía. Só o status mudava; nada
--    devolvia o veículo para ATIVO quando a oficina terminava. Como as telas
--    listam veículo por status, ele sumia da operação e continuava sumido
--    depois de consertado — alguém tinha que lembrar de editar em /veiculos.
--
-- 2. `veiculos.km_atual` dependia de os gatilhos existirem, e eles nunca
--    estiveram em migration nenhuma (nasceram à mão na Fase 5). Sem eles a
--    chegada do roteiro não mexia no odômetro do veículo, e a próxima saída era
--    validada contra um km velho.
--
-- Nada de cálculo derivado novo gravado em tabela: `km_atual` é estado do
-- veículo, não soma de nada, e continua sendo o mesmo campo que o gestor edita
-- em /veiculos. Os gatilhos só o mantêm em dia.

-- ---------------------------------------------------------------------------
-- (a) Destrava quem ficou preso.
--
-- Veículo em MANUTENCAO sem nenhuma ordem em aberto que explique. É a marca do
-- bug 1, e também do que o runbook de ir ao ar deixa para trás quando apaga
-- `manutencoes` (docs/handoff.md, passo 2). Roda antes do gatilho existir: o
-- gatilho cuida do futuro, este update cuida do passado.
-- ---------------------------------------------------------------------------

update public.veiculos v
   set status = 'ATIVO'
 where v.status = 'MANUTENCAO'
   and not exists (
     select 1
       from public.manutencoes m
      where m.veiculo_id = v.id
        and m.status not in ('CONCLUÍDA', 'CANCELADA')
   );

-- ---------------------------------------------------------------------------
-- (b) trg_libera_veiculo — concluiu ou cancelou a ordem, o veículo volta.
--
-- `security definer` porque quem fecha a ordem é o gestor, e a RLS de veiculos
-- é escrita para o gestor: a função roda com os direitos do dono para que o
-- caminho não dependa de qual política de UPDATE em veiculos existe hoje.
-- `search_path = ''` é o par obrigatório disso — sem ele, um schema no caminho
-- de busca do chamador poderia trocar por baixo qual `veiculos` é atualizada.
--
-- Duas condições que parecem detalhe e não são:
--   * `v.status = 'MANUTENCAO'` — não ressuscita VENDIDO nem desbloqueia um
--     BLOQUEADO por checklist. Concluir a manutenção não é laudo de vistoria.
--   * `m.id <> new.id` na busca por outra ordem aberta — carro com duas ordens
--     (freio e ar-condicionado) só volta quando a última fechar.
-- ---------------------------------------------------------------------------

create or replace function public.libera_veiculo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('CONCLUÍDA', 'CANCELADA')
     and old.status is distinct from new.status then
    update public.veiculos v
       set status = 'ATIVO'
     where v.id = new.veiculo_id
       and v.status = 'MANUTENCAO'
       and not exists (
         select 1
           from public.manutencoes m
          where m.veiculo_id = new.veiculo_id
            and m.id <> new.id
            and m.status not in ('CONCLUÍDA', 'CANCELADA')
       );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_libera_veiculo on public.manutencoes;
create trigger trg_libera_veiculo
  after update of status on public.manutencoes
  for each row execute function public.libera_veiculo();

-- ---------------------------------------------------------------------------
-- (c) km_atual sempre em dia: os dois gatilhos, agora versionados.
--
-- `greatest` e não atribuição direta: os lançamentos chegam fora de ordem (o
-- técnico sem sinal sincroniza a fila do PWA depois, e o checklist de segunda
-- pode ser digitado na quarta). Odômetro não anda para trás — se um registro
-- atrasado trouxesse km menor, a próxima saída seria validada contra um número
-- que o veículo já passou. `greatest` ignora null, então o primeiro registro de
-- um veículo com km_atual vazio preenche o campo.
--
-- Fica `after`: o gatilho não decide se o lançamento vale (isso é constraint e
-- validação de tela), só reflete o que já foi gravado.
-- ---------------------------------------------------------------------------

create or replace function public.atualiza_km_roteiro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.km_chegada is not null then
    update public.veiculos
       set km_atual = greatest(km_atual, new.km_chegada)
     where id = new.veiculo_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_km_roteiro on public.roteiros;
create trigger trg_km_roteiro
  after insert or update of km_chegada on public.roteiros
  for each row execute function public.atualiza_km_roteiro();

-- O checklist também lê o hodômetro, e às vezes é o registro mais recente que
-- existe: veículo que passou a semana parado na base ainda faz vistoria.
create or replace function public.atualiza_km_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.veiculos
     set km_atual = greatest(km_atual, new.km_atual)
   where id = new.veiculo_id;
  return null;
end;
$$;

drop trigger if exists trg_km_checklist on public.checklists;
create trigger trg_km_checklist
  after insert or update of km_atual on public.checklists
  for each row execute function public.atualiza_km_checklist();

-- ---------------------------------------------------------------------------
-- (d) Recalcula o que os gatilhos ausentes deixaram passar.
--
-- Todo lançamento que entrou enquanto os gatilhos não existiam (ou antes de
-- serem recriados) nunca tocou em `km_atual`. Aqui o campo é reconciliado com o
-- maior km que o banco conhece de cada veículo.
--
-- `v.km_atual` entra no `greatest` de propósito: nunca abaixa o valor. O gestor
-- edita esse campo à mão em /veiculos, e o odômetro real pode estar à frente do
-- último registro — a planilha não é a fonte de verdade do painel do carro.
-- Por isso também é idempotente: rodar de novo não muda mais nada.
-- ---------------------------------------------------------------------------

update public.veiculos v
   set km_atual = maior.km
  from (
    select v2.id,
           greatest(
             v2.km_atual,
             (select max(r.km_chegada) from public.roteiros   r where r.veiculo_id = v2.id),
             (select max(c.km_atual)   from public.checklists c where c.veiculo_id = v2.id)
           ) as km
      from public.veiculos v2
  ) maior
 where maior.id = v.id
   and maior.km is not null
   and v.km_atual is distinct from maior.km;
