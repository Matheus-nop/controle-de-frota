// Ler e escrever número do jeito que a equipe digita: em português.
//
// Isto nasceu de um erro caro. Na abertura de uma manutenção alguém digitou
// `30.000` de km e `3.000,00` de orçamento — a forma correta em pt-BR — e o
// sistema gravou 30 e 3. Mil vezes menos, sem avisar nada, e a ordem de
// serviço saiu impressa com "R$ 3,00" para a oficina.
//
// A causa eram dois parsers ingênuos espalhados pelas telas:
//
//   parseInt("30.000", 10)                  -> 30      (o ponto corta o número)
//   parseFloat("3.000,00".replace(",", ".")) -> 3       (replace troca a PRIMEIRA
//                                                        vírgula: vira "3.000.00")
//
// Nenhum dos dois erra alto: erram baixo e calados. Por isso a conversão passou
// a morar num lugar só, com o separador do português entendido de verdade, e as
// telas mostram embaixo do campo o número que vai ser gravado — ambiguidade que
// existe tem que aparecer antes de salvar, não depois na impressora.

/**
 * Texto digitado -> número. Entende as duas notações que aparecem de verdade
 * na operação: a nossa (`3.000,00`) e a que vem colada de planilha (`3000.00`).
 *
 * A regra de desempate é a única parte que exige critério: quando o último
 * separador tem exatamente três dígitos depois dele, ele é separador de
 * milhar, não decimal. É o que faz `30.000` valer trinta mil e `1.234.567`
 * valer um milhão — e vale igual para a vírgula, porque `30,000` também é
 * trinta mil na cabeça de quem digitou. Dinheiro e quilometragem aqui se
 * escrevem com duas casas ou nenhuma; três casas depois da vírgula não é
 * centavo, é milhar mal digitado.
 *
 * Texto sem dígito nenhum vira `null` — campo vazio é ausência de número, não
 * zero. Gravar 0 no lugar de "não informado" é outra mentira silenciosa.
 */
export function paraDecimal(bruto: string | null | undefined): number | null {
  const limpo = (bruto ?? "").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(limpo)) return null;

  const negativo = limpo.trimStart().startsWith("-");
  const corpo = limpo.replace(/-/g, "");

  const sep = Math.max(corpo.lastIndexOf(","), corpo.lastIndexOf("."));
  const depois = sep < 0 ? "" : corpo.slice(sep + 1);
  const separadorEhMilhar = sep < 0 || /^\d{3}$/.test(depois);

  const inteiro = (separadorEhMilhar ? corpo : corpo.slice(0, sep)).replace(/[.,]/g, "");
  const fracao = separadorEhMilhar ? "" : depois.replace(/[.,]/g, "");

  const n = Number(`${inteiro || "0"}.${fracao || "0"}`);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/**
 * O mesmo, para quilometragem: hodômetro não tem casa decimal.
 *
 * Corta a casa decimal em vez de recusar o que veio com vírgula: travar o
 * registro de chegada por meio quilômetro seria pior. Corta, e não arredonda,
 * porque o hodômetro de quem digitou `66402,5` marca 66402 — arredondar para
 * cima inventaria um quilômetro que o veículo ainda não rodou, e é contra esse
 * número que a próxima saída vai ser validada.
 */
export function paraInteiro(bruto: string | null | undefined): number | null {
  const n = paraDecimal(bruto);
  return n == null ? null : Math.trunc(n);
}

/** `30000` -> `"30.000 km"`. O `maximumFractionDigits` é o que impede um
 *  número quebrado vindo do banco de imprimir "30.000,5 km" na ordem. */
export function emKm(n: number | null | undefined, vazio = "—"): string {
  return n == null ? vazio : n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " km";
}

/** `3000` -> `"R$ 3.000,00"`. */
export function emReais(n: number | null | undefined, vazio = "—"): string {
  return n == null
    ? vazio
    : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** `12.5` -> `"12,5 km/l"`. */
export function emKmPorLitro(n: number | null | undefined, vazio = "—"): string {
  return n == null ? vazio : n.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " km/l";
}
