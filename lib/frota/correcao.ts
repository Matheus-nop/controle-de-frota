// O que o gestor corrigiu numa vistoria, e quem foi.
//
// O CASO
//
// "Fizeram um checklist da Saveiro como se fosse da Strada."
//
// A vistoria aconteceu: o técnico andou em volta do veículo, tirou as cinco
// fotos, leu o hodômetro. Só o veículo escolhido na lista está errado. Anular e
// mandar refazer joga fora um trabalho que foi feito certo — e ninguém vai
// refazer, porque o veículo já saiu para a rua e as fotos são de ontem.
//
// O estrago de deixar como está é grande: a Strada fica com um km que não é
// dela e com avarias que não são dela, e a Saveiro fica sem vistoria na semana.
// O comparativo das duas passa a comparar coisa com coisa nenhuma.
//
// A REGRA
//
// Corrigir é trocar a placa do registro, e NÃO reescrever a história. Toda
// troca entra em `itens.correcoes`, que é uma lista que só cresce: o que era,
// o que passou a ser, quem trocou e quando. A tela mostra isso no cartão da
// vistoria, para sempre.
//
// Sem esse rastro, "esta vistoria é da Saveiro" e "esta vistoria FOI TROCADA
// para a Saveiro por alguém na terça" seriam a mesma frase para quem olha o
// histórico seis meses depois — e não são, principalmente numa conversa sobre
// quem bateu o veículo.

import { emKm } from "./numero.ts";
import { dataBR } from "./tempo.ts";

/** Uma correção feita depois do envio. */
export type Correcao = {
  /** `veiculo` ou `km`. Texto solto, e não enum, porque a lista fica gravada no
   *  jsonb: campo novo não pode quebrar a leitura de registro antigo. */
  campo: string;
  de: string | null;
  para: string | null;
  por: string | null;
  em: string | null;
};

/** O que muda, sem quem nem quando — isso quem carimba é `registrarCorrecoes`. */
export type Mudanca = { campo: string; de: string | null; para: string | null };

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * A lista de correções, lida de um jsonb que é a PRÓPRIA lista.
 *
 * A vistoria guarda as dela dentro de `itens.correcoes` (o jsonb já existia);
 * o roteiro guarda numa coluna `correcoes` só dela (não havia jsonb onde
 * pendurar). Duas moradas, um leitor — senão a tela do histórico precisaria
 * saber de qual tabela veio cada linha para saber como ler o rastro.
 */
export function correcoesDaLista(bruto: unknown): Correcao[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const o = c as Record<string, unknown>;
      const campo = texto(o.campo);
      if (!campo) return null;
      return { campo, de: texto(o.de), para: texto(o.para), por: texto(o.por), em: texto(o.em) };
    })
    .filter((c): c is Correcao => c !== null);
}

/** As correções já gravadas num `itens` de vistoria, da mais antiga para a mais nova. */
export function correcoesDe(itens: unknown): Correcao[] {
  if (!itens || typeof itens !== "object") return [];
  return correcoesDaLista((itens as Record<string, unknown>).correcoes);
}

/**
 * A lista nova depois de carimbar as mudanças. Mudança que não muda nada não
 * entra — ver `registrarCorrecoes`.
 */
export function acrescentarCorrecoes(
  lista: Correcao[],
  mudancas: Mudanca[],
  quem: string | null,
  agora: string = new Date().toISOString(),
): Correcao[] {
  const novas = mudancas
    .filter((m) => (m.de ?? "") !== (m.para ?? ""))
    .map((m) => ({ campo: m.campo, de: m.de, para: m.para, por: quem || "gestor", em: agora }));
  return novas.length === 0 ? lista : [...lista, ...novas];
}

/**
 * Carimba as mudanças no registro e devolve o `itens` novo.
 *
 * Mudança que não muda nada não entra: trocar a placa e deixar o km igual grava
 * uma linha só. Lista de correções que registra o que ficou igual vira ruído, e
 * ruído é o que faz alguém parar de ler o rastro.
 *
 * Não toca no banco — quem grava é a tela, e assim a regra se prova sem
 * Supabase nenhum.
 */
export function registrarCorrecoes(
  itens: unknown,
  mudancas: Mudanca[],
  quem: string | null,
  agora: string = new Date().toISOString(),
): Record<string, unknown> {
  const base = (itens && typeof itens === "object" ? { ...(itens as Record<string, unknown>) } : {}) as Record<
    string,
    unknown
  >;
  const antes = correcoesDe(base);
  const depois = acrescentarCorrecoes(antes, mudancas, quem, agora);
  if (depois === antes) return base;
  base.correcoes = depois;
  return base;
}

/** Uma linha para a tela: "veículo: STRADA SRT9D55 → SAVEIRO QNZ4F12". */
export function resumoDaCorrecao(c: Correcao): string {
  const nome = c.campo === "veiculo" ? "veículo" : c.campo;
  return `${nome}: ${c.de ?? "—"} → ${c.para ?? "—"}`;
}

/** Os nomes de campo do roteiro, escritos como a tela mostra. Texto solto no
 *  jsonb, e não enum: campo novo não pode quebrar a leitura de registro
 *  antigo. */
export const CAMPO_KM_SAIDA = "km de saída";
export const CAMPO_KM_CHEGADA = "km de chegada";

/* --------------------------------------------------- conferência da troca */

/** A vistoria vizinha, no veículo de destino: a de antes e a de depois desta
 *  data. É contra elas que o km desta vistoria tem que fazer sentido. */
export type Vizinha = { data: string; km_atual: number | null; mesmoDia: boolean };

/**
 * O que não fecha ao mover a vistoria para outro veículo.
 *
 * São AVISOS, e não impedimentos. Quem chega aqui está consertando dado torto à
 * mão, com o veículo já na rua; uma trava viraria só um motivo para desistir e
 * deixar o registro errado — que é o pior dos desfechos.
 *
 * Fica fora do componente para poder ser provado sem navegador: é a regra que
 * decide se o gestor escolheu o veículo certo, e regra que decide não devia
 * morar dentro de um `return (`.
 */
export function avisosDaTroca(p: {
  km: number | null;
  antes: Vizinha | null;
  depois: Vizinha | null;
  placaDestino: string;
  data: string;
}): string[] {
  const avisos: string[] = [];
  // Duas vistorias do mesmo veículo no mesmo dia acontecem (o técnico refaz
  // depois de corrigir algo), mas no meio de uma correção isso quase sempre
  // quer dizer que o gestor está prestes a duplicar a vistoria certa.
  if (p.antes?.mesmoDia) {
    avisos.push(
      `${p.placaDestino} já tem uma vistoria em ${dataBR(p.data)}. Confira se não é a mesma.`,
    );
  }
  if (p.km != null && p.antes?.km_atual != null && p.km < p.antes.km_atual) {
    avisos.push(
      `O km ficaria menor que o da vistoria de ${dataBR(p.antes.data)} desse veículo (${emKm(p.antes.km_atual)}). Hodômetro não anda para trás.`,
    );
  }
  if (p.km != null && p.depois?.km_atual != null && p.km > p.depois.km_atual) {
    avisos.push(
      `O km ficaria maior que o da vistoria de ${dataBR(p.depois.data)} desse veículo (${emKm(p.depois.km_atual)}).`,
    );
  }
  return avisos;
}
