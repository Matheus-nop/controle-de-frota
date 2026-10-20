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

/**
 * A foto do motor, pedida UMA VEZ POR MÊS e não toda semana.
 *
 * Fica fora do ANGULOS de propósito: aquela lista é a das cinco obrigatórias
 * em toda vistoria, e é ela que a validação semanal percorre. Misturar as duas
 * faria o técnico ser barrado por uma foto mensal numa semana qualquer.
 *
 * A chave entra no mesmo mapa `angulos`, então o histórico, o comparativo e a
 * reclassificação pelo gestor já a nomeiam sem precisar saber que ela é mensal.
 */
export const ANGULO_MOTOR: [string, string, string] = [
  "motor",
  "Motor",
  "O compartimento do motor aberto, inteiro no quadro — uma vez por mês.",
];

/** As seis, para quem lista foto já gravada: o gestor reclassificando, a
 *  galeria, o papel. Quem VALIDA a vistoria semanal usa ANGULOS. */
export const ANGULOS_TODOS: [string, string, string][] = [...ANGULOS, ANGULO_MOTOR];

/** Se esta vistoria trouxe a foto do motor. */
export function temFotoDoMotor(itens: unknown): boolean {
  return Object.values(mapaDeAngulos(itens)).includes(ANGULO_MOTOR[0]);
}

/**
 * Se a foto do motor é devida: ninguém a registrou no mês.
 *
 * Recebe as vistorias do mês do veículo, não todas: a conta é por mês-calendário
 * e por veículo. Mês-calendário, e não "faz 30 dias", porque é assim que a
 * equipe fala e porque a cobrança vira "este mês já foi?" — pergunta que uma
 * janela deslizante não responde.
 */
export function precisaFotoDoMotor(vistoriasDoMes: { itens: unknown }[]): boolean {
  return !vistoriasDoMes.some((v) => temFotoDoMotor(v.itens));
}

/**
 * As fotos que ESTA vistoria tem que trazer: as cinco de sempre, mais a do
 * motor no mês em que ela é devida.
 *
 * Mora aqui, e não dentro da tela, porque é a regra que decide se o técnico
 * consegue enviar — e regra que barra gente merece teste próprio, não
 * verificação pelo navegador.
 */
export function fotosPedidas(precisaMotor: boolean): [string, string, string][] {
  return precisaMotor ? ANGULOS_TODOS : ANGULOS;
}

/** Os rótulos das fotos que faltam, na ordem em que a tela as mostra. Vazio
 *  quando está tudo lá. */
export function fotosFaltando(
  pedidas: [string, string, string][],
  temFoto: (chave: string) => boolean,
): string[] {
  return pedidas.filter(([chave]) => !temFoto(chave)).map(([, rotulo]) => rotulo);
}

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
