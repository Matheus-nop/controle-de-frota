// Prova da conferência do km corrigido.
//
// Roda com: npm test
//
// É a regra que decide se o gestor consegue gravar. Errar para o lado frouxo
// deixa passar um km que o banco recusa — e aí o gestor leva "violates check
// constraint" na cara. Errar para o lado apertado tranca o conserto, e o
// roteiro fica "NA RUA" para sempre. Os dois lados têm teste.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  conferirCorrecao,
  ultimoKm,
  vizinhosDoRoteiro,
  KM_ABSURDO,
  KM_AVISO,
  type RoteiroDoVeiculo,
} from "./km.ts";

const r = (id: string, dia: string, saida: number, chegada: number | null = null): RoteiroDoVeiculo => ({
  id,
  saida_em: `2026-10-${dia}T09:00:00Z`,
  km_saida: saida,
  km_chegada: chegada,
});

const SEM_VIZINHOS = { anterior: null, seguinte: null };

test("o caso real: 2012 vira 212 e nada reclama", () => {
  const c = conferirCorrecao({ kmSaida: 212, kmChegada: null, vizinhos: SEM_VIZINHOS });
  assert.deepEqual(c.impedimentos, []);
  assert.deepEqual(c.avisos, []);
  assert.equal(c.rodado, null, "roteiro ainda aberto não tem rodado");
});

test("chegada menor que a saída é impedimento, não aviso — o banco recusa", () => {
  const c = conferirCorrecao({ kmSaida: 2012, kmChegada: 250, vizinhos: SEM_VIZINHOS });
  assert.equal(c.impedimentos.length, 1);
  assert.match(c.impedimentos[0], /não anda para trás/);
  assert.equal(c.rodado, 250 - 2012);
});

test("acima do teto do banco é impedimento; logo abaixo dele passa", () => {
  const acima = conferirCorrecao({
    kmSaida: 100,
    kmChegada: 100 + KM_ABSURDO + 1,
    vizinhos: SEM_VIZINHOS,
  });
  assert.equal(acima.impedimentos.length, 1);
  assert.match(acima.impedimentos[0], /digitação/);

  const noLimite = conferirCorrecao({
    kmSaida: 100,
    kmChegada: 100 + KM_ABSURDO,
    vizinhos: SEM_VIZINHOS,
  });
  assert.deepEqual(noLimite.impedimentos, [], "o teto é inclusivo, igual à constraint");
});

test("km alto avisa e não barra: viagem longa acontece", () => {
  const c = conferirCorrecao({
    kmSaida: 100,
    kmChegada: 100 + KM_AVISO + 1,
    vizinhos: SEM_VIZINHOS,
  });
  assert.deepEqual(c.impedimentos, []);
  assert.equal(c.avisos.length, 1);
  assert.match(c.avisos[0], /fila de km alto/);
});

test("hodômetro para trás entre roteiros avisa, mas NÃO tranca", () => {
  // Quem corrige costuma estar arrumando dois roteiros errados em sequência.
  // Travar aqui prenderia os dois para sempre.
  const c = conferirCorrecao({
    kmSaida: 212,
    kmChegada: null,
    vizinhos: { anterior: r("ant", "19", 100, 980), seguinte: null },
  });
  assert.deepEqual(c.impedimentos, [], "é aviso, não trava");
  assert.equal(c.avisos.length, 1);
  assert.match(c.avisos[0], /980 km/);
  assert.match(c.avisos[0], /19\/10\/2026/);
});

test("passar do km do roteiro seguinte também avisa", () => {
  // 288 km rodados, de propósito abaixo do KM_AVISO: assim o único aviso que
  // sobra é o da corrente do hodômetro, e o teste não passa por acidente com a
  // mensagem errada.
  const c = conferirCorrecao({
    kmSaida: 212,
    kmChegada: 500,
    vizinhos: { anterior: null, seguinte: r("seg", "22", 400) },
  });
  assert.equal(c.avisos.length, 1);
  assert.match(c.avisos[0], /400 km/);
});

test("roteiro ainda aberto compara a SAÍDA com o seguinte — não tem chegada para comparar", () => {
  const c = conferirCorrecao({
    kmSaida: 900,
    kmChegada: null,
    vizinhos: { anterior: null, seguinte: r("seg", "22", 400) },
  });
  assert.equal(c.avisos.length, 1, "sem chegada, quem é comparado é a saída");
});

test("os vizinhos saem da DATA, não do km — o km é justamente o que está errado", () => {
  const todos = [
    r("ant", "19", 100, 180),
    r("este", "21", 2012), // o errado: km gigante, mas data no meio
    r("seg", "22", 300),
  ];
  const v = vizinhosDoRoteiro("este", "2026-10-21T09:00:00Z", todos);
  assert.equal(v.anterior?.id, "ant");
  assert.equal(v.seguinte?.id, "seg");
});

test("sem vizinho de um dos lados, o lado fica nulo e nada é inventado", () => {
  const v = vizinhosDoRoteiro("este", "2026-10-21T09:00:00Z", [r("este", "21", 212)]);
  assert.equal(v.anterior, null);
  assert.equal(v.seguinte, null);
});

test("o último km de um roteiro é a chegada; sem chegada, a saída", () => {
  assert.equal(ultimoKm(r("a", "19", 100, 180)), 180);
  assert.equal(ultimoKm(r("a", "19", 100)), 100);
});

test("km de saída em branco é impedimento, não um save silencioso", () => {
  const c = conferirCorrecao({ kmSaida: null, kmChegada: null, vizinhos: SEM_VIZINHOS });
  assert.equal(c.impedimentos.length, 1);
  assert.match(c.impedimentos[0], /Informe o km de saída/);
});
