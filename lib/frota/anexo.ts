// O gestor anexa foto a uma vistoria já registrada.
//
// O CASO
//
// O técnico faz a vistoria e o celular não colabora: sem espaço, sem sinal no
// galpão, a foto sai preta. Ele manda as que faltam por WhatsApp e segue para a
// rua. Hoje essas fotos morrem na conversa: a vistoria fica com duas fotos, o
// comparativo da semana seguinte não tem o que comparar, e o amassado que
// aparecer depois não tem como ser datado.
//
// Refazer a vistoria seria pior — inventaria uma vistoria que não aconteceu,
// com o km de hoje e a data de hoje. O que aconteceu foi uma vistoria só, com
// foto que chegou atrasada.
//
// A REGRA
//
// Foto anexada fica MARCADA. `itens.anexos` é o mapa `{ url: { por, em } }` de
// tudo que não veio do formulário do técnico, e a tela mostra a marca. Numa
// discussão sobre quando o dano apareceu, "o técnico fotografou na hora" e "o
// gestor anexou três dias depois" não valem a mesma coisa, e o registro tem que
// deixar isso à vista em vez de esconder.
//
// E o que o técnico mandou não se apaga por aqui: `removerAnexo` só tira URL
// que está no mapa de anexos — ou seja, só desfaz o que o próprio gestor fez.

import { listaDeAvariasParaGravar, urls, type AvariaGravada } from "./avarias";

/** Quem anexou e quando. */
export type Anexo = { por: string; em: string };

/** Uma foto nova, com o ângulo que ela mostra quando é foto da volta do
 *  veículo. `angulo` nulo é foto solta — detalhe, documento, o que for. */
export type FotoNova = { url: string; angulo: string | null };

function objeto(itens: unknown): Record<string, unknown> {
  return itens && typeof itens === "object" ? { ...(itens as Record<string, unknown>) } : {};
}

/** O mapa de anexos da vistoria. Vazio quando nada foi anexado. */
export function anexosDe(itens: unknown): Record<string, Anexo> {
  const bruto = objeto(itens).anexos;
  if (!bruto || typeof bruto !== "object") return {};
  const saida: Record<string, Anexo> = {};
  for (const [url, v] of Object.entries(bruto as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const por = typeof o.por === "string" ? o.por : "";
    const em = typeof o.em === "string" ? o.em : "";
    if (por || em) saida[url] = { por: por || "gestor", em };
  }
  return saida;
}

/** Quem anexou esta foto, ou `null` se ela veio do formulário do técnico. */
export function fotoAnexada(itens: unknown, url: string): Anexo | null {
  return anexosDe(itens)[url] ?? null;
}

function marcar(
  base: Record<string, unknown>,
  novas: string[],
  quem: string | null,
  agora: string,
): void {
  const mapa = { ...anexosDe(base) };
  for (const u of novas) mapa[u] = { por: quem || "gestor", em: agora };
  base.anexos = mapa;
}

/**
 * Anexa fotos da volta do veículo a uma vistoria.
 *
 * Entram em `fotos_semanais`, que é a lista que o histórico, o comparativo e a
 * reclassificação já leem — foto anexada é foto da vistoria, e não uma terceira
 * categoria que cada tela teria que aprender a mostrar.
 */
export function anexarSemanais(
  itens: unknown,
  fotos: FotoNova[],
  quem: string | null,
  agora: string = new Date().toISOString(),
): Record<string, unknown> {
  const base = objeto(itens);
  const novas = fotos.map((f) => f.url).filter((u) => typeof u === "string" && u);
  if (novas.length === 0) return base;

  base.fotos_semanais = [...urls(base.fotos_semanais), ...novas];

  // O ângulo é o que permite comparar traseira com traseira. Foto sem ângulo
  // não entra no mapa: mapa com valor vazio mentiria sobre o que a foto mostra.
  const angulos: Record<string, unknown> = { ...(objeto(base.angulos) as Record<string, unknown>) };
  for (const f of fotos) if (f.angulo) angulos[f.url] = f.angulo;
  if (Object.keys(angulos).length > 0) base.angulos = angulos;

  marcar(base, novas, quem, agora);
  return base;
}

/**
 * Anexa fotos já como avaria — o técnico mandou a foto do farol quebrado
 * depois, e ela nunca foi "semanal".
 *
 * A avaria nasce assinada: sem isso ela ficaria indistinguível de dano visto e
 * registrado em campo no dia.
 */
export function anexarComoAvaria(
  itens: unknown,
  fotos: string[],
  dados: { onde: string | null; tipo: string | null; descricao: string | null },
  quem: string | null,
  agora: string = new Date().toISOString(),
): Record<string, unknown> {
  const base = objeto(itens);
  const novas = fotos.filter((u) => typeof u === "string" && u);
  if (novas.length === 0) return base;

  const avarias = listaDeAvariasParaGravar(base);
  avarias.push({
    onde: dados.onde || null,
    tipo: dados.tipo || null,
    ja_existia: null,
    descricao: dados.descricao || null,
    fotos: novas,
    anexada_por: quem || "gestor",
    anexada_em: agora,
  });
  base.avarias = avarias;
  delete base.avaria; // a chave antiga não convive com a lista
  base.nova_avaria = "SIM";

  marcar(base, novas, quem, agora);
  return base;
}

/** Se esta avaria só existe por causa do gestor — reclassificada ou anexada.
 *  Avaria assim, sem foto nenhuma sobrando, não tem mais o que registrar. */
function avariaDoGestor(a: AvariaGravada): boolean {
  const marca = (v: unknown) => typeof v === "string" && v.trim() !== "";
  return marca(a.reclassificada_por) || marca(a.anexada_por);
}

/**
 * Tira uma foto que o gestor anexou — a única coisa que se desfaz por aqui.
 *
 * Foto que o técnico mandou não sai: ela não está no mapa de anexos, e a função
 * devolve o registro intocado. Vistoria é prova, e apagar prova por engano não
 * pode ser um clique de distância.
 */
export function removerAnexo(itens: unknown, url: string): Record<string, unknown> {
  const base = objeto(itens);
  const mapa = { ...anexosDe(base) };
  if (!mapa[url]) return base;

  base.fotos_semanais = urls(base.fotos_semanais).filter((u) => u !== url);

  const angulos = { ...(objeto(base.angulos) as Record<string, unknown>) };
  delete angulos[url];
  base.angulos = angulos;

  const avarias = listaDeAvariasParaGravar(base)
    .map((a) => ({ ...a, fotos: urls(a.fotos).filter((u) => u !== url) }))
    // Avaria do gestor que ficou sem foto some: o que ela registrava era a foto.
    // A do técnico fica, mesmo sem foto — ele viu o dano, e isso continua dito.
    .filter((a) => (a.fotos as string[]).length > 0 || !avariaDoGestor(a));
  base.avarias = avarias;
  delete base.avaria;
  if (avarias.length === 0) base.nova_avaria = "NÃO";

  delete mapa[url];
  base.anexos = mapa;
  return base;
}
