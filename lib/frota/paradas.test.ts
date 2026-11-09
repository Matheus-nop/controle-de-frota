// Prova do registro de parada e da pergunta que ele existe para responder.
//
// Roda com: npm test
//
// O erro aqui custa dinheiro de verdade: indicar o condutor errado numa multa
// é multa + pontos na carteira de alguém que não dirigiu. Por isso a conta tem
// teste, e por isso o caso de contradição (parada E roteiro no mesmo dia) tem
// um teste só dele.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisosDaParada,
  cobre,
  diasDaParada,
  emAndamento,
  faltaMigracaoDasParadas,
  quemEstavaCom,
  resumoDaParada,
  roteirosNoDia,
  type Parada,
  type RoteiroNoDia,
} from "./paradas.ts";

const ITAVEMA: Parada = {
  id: "p1",
  veiculo_id: "v1",
  de: "2026-08-25",
  ate: "2026-10-13",
  onde: "ITAVEMA",
  motivo: "MANUTENÇÃO CORRETIVA",
  observacao: null,
};

/** Um roteiro às 9h de Brasília (12h UTC), para não cair no dia anterior. */
const rot = (id: string, dia: string, fim?: string): RoteiroNoDia => ({
  id,
  saida_em: `${dia}T12:00:00Z`,
  chegada_em: fim ? `${fim}T21:00:00Z` : null,
  tecnico_saida: "LEONARDO OLIVEIRA",
  tecnico_chegada: fim ? "LEONARDO OLIVEIRA" : null,
});

test("a parada cobre os dois extremos: o dia que saiu e o dia que voltou", () => {
  assert.equal(cobre(ITAVEMA, "2026-08-25"), true, "o dia da ida conta");
  assert.equal(cobre(ITAVEMA, "2026-10-13"), true, "o dia da volta conta");
  assert.equal(cobre(ITAVEMA, "2026-09-12"), true);
  assert.equal(cobre(ITAVEMA, "2026-08-24"), false);
  assert.equal(cobre(ITAVEMA, "2026-10-14"), false);
});

test("parada sem data de volta cobre tudo daí para frente", () => {
  const aberta = { ...ITAVEMA, ate: null };
  assert.equal(emAndamento(aberta), true);
  assert.equal(cobre(aberta, "2029-01-01"), true);
  assert.equal(cobre(aberta, "2026-08-24"), false);
});

test("a multa de 12/09: o veículo estava com a ITAVEMA, não com a equipe", () => {
  const r = quemEstavaCom("2026-09-12", [ITAVEMA], [rot("r1", "2026-07-01", "2026-07-01")]);
  assert.equal(r.tipo, "terceiro");
  assert.equal(r.paradas[0].onde, "ITAVEMA");
  assert.deepEqual(r.roteiros, [], "o roteiro de julho não entra");
  assert.deepEqual(r.condutores, []);
});

test("fora do período, quem responde é o roteiro da equipe", () => {
  const r = quemEstavaCom("2026-07-01", [ITAVEMA], [rot("r1", "2026-07-01", "2026-07-01")]);
  assert.equal(r.tipo, "equipe");
  assert.deepEqual(r.condutores, ["LEONARDO OLIVEIRA"]);
});

test("dia sem registro nenhum responde 'nada' — e não inventa um culpado", () => {
  const r = quemEstavaCom("2026-07-20", [ITAVEMA], []);
  assert.equal(r.tipo, "nada");
  assert.deepEqual(r.condutores, []);
  assert.deepEqual(r.paradas, []);
});

test("parada E roteiro no mesmo dia devolve os DOIS: é contradição, não empate", () => {
  // Escolher um calado faria a empresa indicar o condutor errado ao órgão de
  // trânsito com a própria base dizendo o contrário.
  const r = quemEstavaCom("2026-09-12", [ITAVEMA], [rot("r1", "2026-09-12", "2026-09-12")]);
  assert.equal(r.tipo, "terceiro");
  assert.equal(r.paradas.length, 1);
  assert.equal(r.roteiros.length, 1, "o roteiro continua à vista");
  assert.deepEqual(r.condutores, ["LEONARDO OLIVEIRA"]);
});

test("roteiro que virou o dia cobre os dois dias", () => {
  const r = [rot("r1", "2026-07-01", "2026-07-02")];
  assert.equal(roteirosNoDia(r, "2026-07-01").length, 1);
  assert.equal(roteirosNoDia(r, "2026-07-02").length, 1);
  assert.equal(roteirosNoDia(r, "2026-07-03").length, 0);
});

test("roteiro aberto cobre só o dia da saída — não se sabe quando volta", () => {
  const r = [rot("r1", "2026-07-01")];
  assert.equal(roteirosNoDia(r, "2026-07-01").length, 1);
  assert.equal(roteirosNoDia(r, "2026-07-02").length, 0);
});

test("o condutor não se repete quando saída e chegada são da mesma pessoa", () => {
  const r = quemEstavaCom("2026-07-01", [], [rot("r1", "2026-07-01", "2026-07-01")]);
  assert.deepEqual(r.condutores, ["LEONARDO OLIVEIRA"]);
});

test("período que se cruza com outro avisa, mas não trava", () => {
  const avisos = avisosDaParada({
    de: "2026-10-01",
    ate: "2026-10-20",
    onde: "OUTRA",
    outras: [ITAVEMA],
    roteiros: [],
  });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /se cruza/);
  assert.match(avisos[0], /ITAVEMA/);
});

test("roteiro da equipe dentro do período é o aviso que mais importa", () => {
  const avisos = avisosDaParada({
    de: "2026-08-25",
    ate: "2026-10-13",
    onde: "ITAVEMA",
    outras: [],
    roteiros: [rot("r1", "2026-09-12", "2026-09-12")],
  });
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /um dos dois registros está errado/);
});

test("sem data de início não há o que conferir", () => {
  assert.deepEqual(
    avisosDaParada({ de: null, ate: null, onde: "X", outras: [ITAVEMA], roteiros: [] }),
    [],
  );
});

test("a linha da tela diz onde, quando e por quê", () => {
  assert.equal(
    resumoDaParada(ITAVEMA),
    "ITAVEMA · 25/08/2026 a 13/10/2026 · manutenção corretiva",
  );
  assert.match(resumoDaParada({ ...ITAVEMA, ate: null }), /desde 25\/08\/2026/);
});

test("ida e volta no mesmo dia é um dia fora, não zero", () => {
  assert.equal(diasDaParada({ ...ITAVEMA, de: "2026-08-25", ate: "2026-08-25" }, "2026-11-09"), 1);
  assert.equal(diasDaParada(ITAVEMA, "2026-11-09"), 50);
  assert.equal(diasDaParada({ ...ITAVEMA, ate: null }, "2026-08-26"), 2, "aberta conta até hoje");
});

test("a tela sabe dizer que a migração ainda não rodou", () => {
  assert.equal(faltaMigracaoDasParadas({ code: "42P01" }), true);
  assert.equal(faltaMigracaoDasParadas({ code: "PGRST205" }), true);
  assert.equal(faltaMigracaoDasParadas({ code: "23505" }), false);
  assert.equal(faltaMigracaoDasParadas(null), false);
});
