-- =====================================================================
-- Migração 0019: mais de uma nota fiscal por manutenção
-- (idempotente; rode no SQL Editor depois da 0018)
-- =====================================================================
--
-- O QUE A EQUIPE PEDIU
--
-- "Veículos muitas vezes emitem várias notas: de venda de peças e de serviços."
--
-- É como a oficina fatura de verdade. A peça sai numa nota (venda de
-- mercadoria) e a mão de obra em outra (prestação de serviço) — às vezes de
-- CNPJs diferentes, no mesmo conserto. Com um campo só, a segunda nota
-- substituía a primeira e a manutenção ficava com metade do custo comprovado.
-- Na hora de conferir a fatura do mês, ou de acionar garantia de peça, é
-- justamente a nota que sumiu que faz falta.
--
-- A COLUNA ANTIGA FICA
--
-- `nota_fiscal_url` continua onde está, com o que já foi gravado. Não existe
-- migração de dado aqui, de propósito: o app lê as duas formas (ver
-- `lib/frota/notas.ts`), e reescrever registro antigo para caber em formato novo
-- é trocar dado conferido por dado convertido, sem ganho nenhum. Manutenção
-- nova grava só na lista.

alter table public.manutencoes
  add column if not exists notas_fiscais jsonb not null default '[]'::jsonb;

-- Lista, e não objeto solto: o app faz `map` em cima disso, e um objeto aqui
-- viraria tela quebrada em vez de erro de banco.
do $$
begin
  alter table public.manutencoes
    add constraint notas_fiscais_e_lista check (jsonb_typeof(notas_fiscais) = 'array');
exception when duplicate_object then null;
end $$;

comment on column public.manutencoes.notas_fiscais is
  'Notas do conserto: [{"url": "...", "rotulo": "PEÇAS|SERVIÇO|OUTRO", "em": "ISO"}]. A oficina fatura peça e mão de obra em notas separadas.';
comment on column public.manutencoes.nota_fiscal_url is
  'A nota única do formato antigo. Continua sendo lida; escrita nova vai para `notas_fiscais`.';
