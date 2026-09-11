// Os cinco ângulos da vistoria semanal, num lugar só.
//
// Moraram dentro da tela do checklist até o gestor precisar anexar foto por
// alguém: duas listas iguais em telas diferentes é o jeito conhecido de uma
// delas ficar para trás, e aí a foto que o gestor manda como "traseira" não é
// a mesma chave que o técnico grava como "traseira" — e a comparação por
// ângulo, que é o motivo de nomear, deixa de fechar.

/**
 * As cinco fotos da vistoria semanal, na ordem em que se anda em volta do
 * veículo: frente, lado esquerdo, lado direito, traseira — e por último o
 * painel, que é dentro.
 *
 * Ter ângulo nomeado não é só organização. É o que permite comparar a traseira
 * de hoje com a traseira da semana passada, em vez de comparar traseira com
 * lateral e não concluir nada.
 *
 * `[chave gravada no jsonb, rótulo da tela, o que a foto tem que mostrar]`.
 */
export const ANGULOS: [string, string, string][] = [
  ["frontal", "Frontal", "A frente inteira, com a placa visível."],
  ["lateral_esquerda", "Lateral esquerda", "Do lado do motorista, o veículo inteiro."],
  ["lateral_direita", "Lateral direita", "Do lado do passageiro, o veículo inteiro."],
  ["traseira", "Traseira", "A traseira inteira, com a placa visível."],
  ["painel", "Painel", "Com o hodômetro legível — é o km desta vistoria."],
];

/** O mapa `{ url: "lateral_esquerda" }` que a vistoria guardou, ou vazio.
 *  Vistoria feita antes do formulário guiado não tem o mapa. */
export function mapaDeAngulos(itens: unknown): Record<string, string> {
  if (!itens || typeof itens !== "object") return {};
  const m = (itens as Record<string, unknown>).angulos;
  if (!m || typeof m !== "object") return {};
  const saida: Record<string, string> = {};
  for (const [url, chave] of Object.entries(m as Record<string, unknown>)) {
    if (typeof chave === "string" && chave) saida[url] = chave;
  }
  return saida;
}

/** A legenda de uma foto semanal: o ângulo quando existe, "semanal" quando não. */
export function legendaDoAngulo(itens: unknown, url: string): string {
  const chave = mapaDeAngulos(itens)[url];
  return chave ? chave.replace(/_/g, " ") : "semanal";
}
