-- A ITAVEMA ficou com UMA Scudo, não com as duas.
-- Revise antes de aplicar: cole no SQL editor do Supabase.
--
-- O ERRO, e ele é meu
--
-- A 0033 inseriu os dois períodos procurando o veículo por
-- `modelo ilike '%SCUDO%'`. A frota tem duas Scudo — SRO5A71 e TTP8H79 — e o
-- insert pegou as duas. "Success" no SQL Editor não avisa nada disso: INSERT
-- que acerta quatro linhas e INSERT que acerta duas têm a mesma cara.
--
-- O estrago não é cosmético. Com as quatro linhas, a consulta "quem estava com
-- o veículo?" inocenta as DUAS Scudo em agosto e outubro, inclusive a que
-- estava rodando com técnico nosso. Numa defesa de multa isso é pior do que não
-- ter registro nenhum: é um registro errado com cara de prova.
--
-- A LIÇÃO, para não repetir
--
-- Escolher veículo por `modelo ilike` está certo nos planos de manutenção
-- (0020–0026): lá o fato É do modelo — todo Fiorino tem o mesmo intervalo de
-- revisão. Aqui o fato é de UM veículo: foi uma Scudo específica que entrou na
-- concessionária. Fato de veículo se endereça pela PLACA, que é o identificador
-- (CLAUDE.md), e não pelo modelo, que é característica compartilhada.

-- `registrado_por is null` é a trava que importa: os períodos semeados pela
-- 0033 nasceram sem registrador, e os que alguém lançar pela tela têm um. Sem
-- ela, reaplicar esta migração depois apagaria um registro feito à mão.
delete from public.paradas p
using public.veiculos v
where v.id = p.veiculo_id
  and v.placa = 'SRO5A71'
  and p.onde = 'ITAVEMA'
  and p.motivo = 'MANUTENÇÃO CORRETIVA'
  and p.de in (date '2026-08-25', date '2026-10-29')
  and p.registrado_por is null;
