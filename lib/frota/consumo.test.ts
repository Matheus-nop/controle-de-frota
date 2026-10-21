// Prova do comparador de consumo.
//
// Roda com: npm test
//
// Esta conta decide qual veículo sai para a obra. Conta que decide merece
// prova, e não conferência no olho — ainda mais porque o erro aqui é silencioso:
// um número errado continua parecendo um número, e ninguém desconfia de
// "R$ 142,80".
//
// Sem dependência nova: o `node:test` vem com o Node, e o `--experimental-strip-types`
// lê o TypeScript direto. Não há navegador no meio porque não há tela no meio —
// o que está provado aqui é a aritmética.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseEmTexto,
  compararConsumo,
  faltaNaFicha,
  gastoPorVeiculo,
  motivoDeFicarDeFora,
  rodagemPorPlaca,
  KM_MINIMO_DE_BASE,
  type FichaDoVeiculo,
} from "./consumo.ts";

/** Uma ficha de veículo. `custo_km` é coluna GERADA no banco; aqui a fixture
 *  imita o banco em vez de a tela recalcular — é a mesma regra dos dois lados. */
function ficha(
  id: string,
  placa: string,
  consumo: number | null,
  preco: number | null,
  status = "ATIVO",
): FichaDoVeiculo {
  return {
    id,
    placa,
    modelo: "MODELO " + placa,
    status,
    consumo_km_l: consumo,
    valor_combustivel: preco,
    custo_km: consumo && preco ? preco / consumo : null,
  };
}

test("a ficha incompleta diz QUAL campo falta, para o gestor saber o que corrigir", () => {
  assert.equal(faltaNaFicha(ficha("1", "AAA", 10, 6)), null);
  assert.match(faltaNaFicha(ficha("1", "AAA", null, 6))!, /consumo \(km\/l\)/);
  assert.match(faltaNaFicha(ficha("1", "AAA", 10, null))!, /preço do combustível/);
  assert.match(faltaNaFicha(ficha("1", "AAA", null, null))!, /consumo e o preço/);
  // zero é tão incadastrado quanto nulo — e dividir por ele daria Infinity
  assert.match(faltaNaFicha(ficha("1", "AAA", 0, 6))!, /consumo/);
});

test("o combustível sai do custo por km do cadastro, e a diferença é para o mais barato", () => {
  const linhas = compararConsumo(
    200,
    [ficha("1", "FIORINO", 10, 6), ficha("2", "BONGO", 8, 6)],
    [],
    [],
  );
  assert.deepEqual(linhas.map((l) => l.placa), ["FIORINO", "BONGO"]);
  assert.equal(linhas[0].combustivel, 120); // 200 km × R$ 0,60/km
  assert.equal(linhas[1].combustivel, 150); // 200 km × R$ 0,75/km
  assert.equal(linhas[0].litros, 20);
  assert.equal(linhas[1].litros, 25);
  assert.equal(linhas[0].diferenca, 0, "o mais barato é a referência");
  assert.equal(linhas[1].diferenca, 30, "o outro diz quanto custa a mais");
});

test("veículo sem ficha fica na tela, no fim, e com número nulo — nunca zero", () => {
  const linhas = compararConsumo(
    100,
    [ficha("1", "SEMFICHA", null, null), ficha("2", "OK", 10, 5)],
    [],
    [],
  );
  assert.deepEqual(linhas.map((l) => l.placa), ["OK", "SEMFICHA"]);
  assert.equal(linhas[1].combustivel, null, "zero diria que o veículo roda de graça");
  assert.equal(linhas[1].diferenca, null, "quem não tem número não entra na conta");
  assert.equal(linhas[0].diferenca, 0);
});

test("a manutenção vira o jogo: quem bebe menos pode ser quem mais custa", () => {
  const veiculos = [ficha("1", "A", 10, 6), ficha("2", "B", 10, 6)];
  const roteiros = [
    { placa: "A", km_rodado: 10000 },
    { placa: "B", km_rodado: 10000 },
    { placa: "B", km_rodado: null }, // ainda na rua: não fechou km
  ];
  const ordens = [
    { veiculo_id: "1", status: "CONCLUÍDA", valor_final: 1000 },
    { veiculo_id: "2", status: "CONCLUÍDA", valor_final: 5000 },
    { veiculo_id: "2", status: "EM ANDAMENTO", valor_final: null },
    { veiculo_id: "2", status: "ABERTA", valor_final: 9999 }, // previsão não é gasto
  ];

  const porComb = compararConsumo(100, veiculos, roteiros, ordens, "combustivel");
  assert.equal(porComb[0].combustivel, porComb[1].combustivel, "no combustível empatam");
  assert.deepEqual(porComb.map((l) => l.placa), ["A", "B"], "empate desempata pela placa");

  const porTotal = compararConsumo(100, veiculos, roteiros, ordens, "total");
  assert.equal(porTotal[0].manutencaoPorKm, 0.1);
  assert.equal(porTotal[1].manutencaoPorKm, 0.5);
  assert.equal(porTotal[0].total, 60 + 10);
  assert.equal(porTotal[1].total, 60 + 50);
  assert.equal(porTotal[1].diferenca, 40);
  assert.deepEqual(porTotal[1].base, { km: 10000, gasto: 5000, ordens: 1 });
});

test("base curta não vira taxa: 400 km e uma troca de óleo não são R$ 1/km", () => {
  const linhas = compararConsumo(
    100,
    [ficha("1", "NOVO", 10, 6)],
    [{ placa: "NOVO", km_rodado: KM_MINIMO_DE_BASE - 1 }],
    [{ veiculo_id: "1", status: "CONCLUÍDA", valor_final: 400 }],
    "total",
  );
  assert.equal(linhas[0].manutencaoPorKm, null);
  assert.equal(linhas[0].total, null);
  assert.equal(linhas[0].diferenca, null);
  // e o motivo manda trocar o critério, não procurar erro no cadastro
  assert.match(motivoDeFicarDeFora(linhas[0], "total"), /comparação por combustível/);
});

test("zero de manutenção É uma resposta quando o veículo rodou o bastante", () => {
  const linhas = compararConsumo(
    100,
    [ficha("1", "SADIO", 10, 6)],
    [{ placa: "SADIO", km_rodado: 20000 }],
    [],
    "total",
  );
  assert.equal(linhas[0].manutencaoPorKm, 0, "20 mil km sem oficina custou zero mesmo");
  assert.equal(linhas[0].total, 60);
  assert.match(baseEmTexto(linhas[0].base), /20\.000 km rodados e 0 ordens/);
});

test("os somatórios: roteiro na rua não soma km, ordem sem valor não soma gasto", () => {
  assert.equal(
    rodagemPorPlaca([
      { placa: "A", km_rodado: 10 },
      { placa: "A", km_rodado: 5 },
      { placa: "A", km_rodado: null },
    ]).get("A"),
    15,
  );
  assert.deepEqual(
    gastoPorVeiculo([
      { veiculo_id: "x", status: "CONCLUÍDA", valor_final: 10 },
      { veiculo_id: "x", status: "CONCLUÍDA", valor_final: 20 },
      { veiculo_id: "x", status: "CONCLUÍDA", valor_final: null },
    ]).get("x"),
    { gasto: 30, ordens: 2 },
  );
});

test("sem ninguém comparável, ninguém tem diferença", () => {
  const linhas = compararConsumo(100, [ficha("1", "A", null, null)], [], []);
  assert.equal(linhas[0].diferenca, null);
});
