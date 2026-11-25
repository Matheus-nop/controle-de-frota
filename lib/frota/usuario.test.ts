// Prova do que vira o login de alguém.
//
// Roda com: npm test
//
// Usuário de login é coisa que a pessoa digita todo dia e que ninguém troca
// depois — errar aqui não dá erro, dá um "marcia souza@frota.local" que não
// entra e que o gestor vai descobrir pelo telefone, com a técnica parada na
// rua. Por isso tem teste.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chutarNome,
  papelValido,
  paraEmail,
  senhaSugerida,
  soUsuario,
  sugerirUsuario,
  VALORES_DE_PAPEL,
} from "./usuario.ts";

test("o acento sai, porque é o que a pessoa digita no teclado do celular", () => {
  assert.equal(sugerirUsuario("Márcia Souza"), "marcia.souza");
  assert.equal(sugerirUsuario("JOSÉ ÁVILA"), "jose.avila");
  assert.equal(sugerirUsuario("Conceição D'Ávila"), "conceicao.davila");
});

test("dois nomes bastam: o resto é comprido demais para ditar no telefone", () => {
  assert.equal(sugerirUsuario("José Carlos da Silva Pereira"), "jose.carlos");
});

test("nome de uma palavra vira usuário de uma palavra, sem ponto solto", () => {
  assert.equal(sugerirUsuario("Alexandre"), "alexandre");
});

test("espaço a mais e pontuação não viram caractere no login", () => {
  assert.equal(sugerirUsuario("  Ana   Maria  "), "ana.maria");
  assert.equal(sugerirUsuario("Ana-Maria Souza"), "anamaria.souza");
});

test("nome que não sobra letra nenhuma devolve vazio — e a tela cobra", () => {
  // Vazio é melhor que inventar: a rota recusa e o gestor digita o usuário.
  assert.equal(sugerirUsuario("!!!"), "");
  assert.equal(sugerirUsuario(""), "");
});

test("o domínio interno entra sozinho; e-mail de verdade passa inteiro", () => {
  assert.equal(paraEmail("marcia.souza"), "marcia.souza@frota.local");
  assert.equal(paraEmail("  MARCIA.SOUZA "), "marcia.souza@frota.local");
  assert.equal(paraEmail("marcia@novaopcao.com.br"), "marcia@novaopcao.com.br");
});

test("ida e volta: o que a tela mostra é o que a pessoa digita", () => {
  assert.equal(soUsuario(paraEmail("marcia.souza")), "marcia.souza");
  assert.equal(soUsuario("marcia@novaopcao.com.br"), "marcia@novaopcao.com.br");
});

test("o nome chutado é só palpite, com a inicial em maiúscula", () => {
  assert.equal(chutarNome("marcia.souza@frota.local"), "Marcia Souza");
  assert.equal(chutarNome("alexandre@frota.local"), "Alexandre");
});

test("papel fora da lista não passa — errar aqui abre porta no sistema", () => {
  for (const p of VALORES_DE_PAPEL) assert.equal(papelValido(p), true);
  assert.equal(papelValido("ADMIN"), false);
  assert.equal(papelValido("tecnico"), false, "minúscula não é o mesmo valor");
  assert.equal(papelValido(null), false);
  assert.equal(papelValido(undefined), false);
});

test("a senha sugerida é ditável e tem o tamanho que o Supabase exige", () => {
  // Sorteio fixo, para a forma ser verificável: 4 sílabas, hífen, 3 dígitos.
  const fixa = senhaSugerida((n) => Array.from({ length: n }, (_, i) => i));
  assert.match(fixa, /^[a-z]{8}-\d{3}$/);
  assert.ok(fixa.length >= 8);
});

test("duas senhas seguidas não saem iguais", () => {
  assert.notEqual(senhaSugerida(), senhaSugerida());
});
