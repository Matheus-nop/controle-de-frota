// O comparador de consumo: "vou rodar 180 km — em qual veículo sai mais barato?"
//
// A pergunta aparece antes de toda obra que fica longe, e hoje ela é respondida
// de cabeça ("a Fiorino bebe menos"). De cabeça erra por dois motivos: o preço
// do combustível muda, e o veículo que bebe menos pode ser o que mais entra na
// oficina. Os dois números existem no sistema; o que faltava era pôr um ao lado
// do outro para a MESMA distância.
//
// Nada aqui é gravado. É simulação: o km é digitado na hora e some quando a
// tela fecha. O que vem do banco são as taxas — `custo_km` do cadastro e o
// histórico de manutenção —, e elas continuam sendo a única fonte de verdade.
//
// Em especial, o custo do combustível por km NÃO é recalculado aqui: ele é a
// coluna gerada `veiculos.custo_km` (valor_combustivel ÷ consumo_km_l, definida
// na 0001). Repetir a divisão em TypeScript criaria duas versões da mesma
// regra, e o dia em que uma delas mudasse a tela discordaria do relatório.

/** O cadastro do veículo, do jeito que a tela lê. */
export type FichaDoVeiculo = {
  id: string;
  placa: string;
  modelo: string;
  status: string;
  consumo_km_l: number | null;
  valor_combustivel: number | null;
  /** Coluna gerada no banco. É ela que manda no custo do combustível. */
  custo_km: number | null;
};

/** Um roteiro fechado, para medir quanto o veículo rodou no período. */
export type RodagemRegistro = { placa: string; km_rodado: number | null };

/** Uma ordem de manutenção do período. */
export type OrdemRegistro = {
  veiculo_id: string;
  status: string;
  valor_final: number | null;
};

/**
 * Quantos km o veículo precisa ter rodado no período para a conta de
 * manutenção por km dizer alguma coisa.
 *
 * Abaixo disso o divisor é pequeno demais: um veículo que rodou 40 km e teve
 * uma troca de óleo de R$ 400 sairia a R$ 10 por km, e a tela recomendaria o
 * veículo errado com um número de aparência exata.
 */
export const KM_MINIMO_DE_BASE = 500;

/** Por qual número a comparação é ordenada. */
export type Criterio = "combustivel" | "total";

/** De onde saiu a taxa de manutenção — o denominador, que toda taxa mostra. */
export type BaseDaManutencao = { km: number; gasto: number; ordens: number };

export type Simulacao = {
  id: string;
  placa: string;
  modelo: string;
  status: string;
  /** O que o cadastro diz — repetido aqui para a tela mostrar de onde o número
   *  saiu sem ter que carregar a ficha junto. É ela que faz alguém confiar, ou
   *  descobrir que o cadastro está com o preço do ano passado. */
  consumo: number | null;
  precoDoLitro: number | null;
  /** Litros estimados pelo consumo cadastrado. Não é bomba de posto. */
  litros: number | null;
  /** R$ por km de combustível — a coluna gerada do cadastro. */
  combustivelPorKm: number | null;
  /** O combustível dos km pedidos. */
  combustivel: number | null;
  /** R$ por km de manutenção, do histórico. Null quando a base é curta. */
  manutencaoPorKm: number | null;
  manutencao: number | null;
  /** Combustível + manutenção. Null se faltar qualquer um dos dois. */
  total: number | null;
  base: BaseDaManutencao | null;
  /** O que falta no cadastro para simular. Null = dá para simular. */
  falta: string | null;
  /** Quanto este custa a mais que o mais barato da lista, no critério usado.
   *  Zero no mais barato; null em quem não entra na comparação. */
  diferenca: number | null;
};

/**
 * O que impede a simulação deste veículo. A mensagem é o que o gestor tem que
 * ir corrigir em /veiculos — e por isso diz o campo, não "dados incompletos".
 */
export function faltaNaFicha(v: FichaDoVeiculo): string | null {
  const semConsumo = v.consumo_km_l == null || v.consumo_km_l <= 0;
  const semPreco = v.valor_combustivel == null || v.valor_combustivel <= 0;
  if (semConsumo && semPreco) return "falta o consumo e o preço do combustível no cadastro";
  if (semConsumo) return "falta o consumo (km/l) no cadastro";
  if (semPreco) return "falta o preço do combustível no cadastro";
  // Cinto de segurança: a coluna gerada não deveria ser nula com os dois
  // preenchidos, mas um registro antigo pode ter escapado.
  if (v.custo_km == null) return "o custo por km não foi calculado no cadastro";
  return null;
}

/** Quanto cada veículo rodou no período, por placa. Roteiro ainda na rua não
 *  entra: ele não fechou km. */
export function rodagemPorPlaca(roteiros: RodagemRegistro[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of roteiros) {
    if (r.km_rodado == null) continue;
    m.set(r.placa, (m.get(r.placa) ?? 0) + r.km_rodado);
  }
  return m;
}

/**
 * Quanto cada veículo gastou em manutenção no período.
 *
 * Só ordem CONCLUÍDA com valor final: orçamento de ordem em aberto é previsão,
 * e previsão somada a gasto vira um número que não é nem um nem outro.
 */
export function gastoPorVeiculo(ordens: OrdemRegistro[]): Map<string, { gasto: number; ordens: number }> {
  const m = new Map<string, { gasto: number; ordens: number }>();
  for (const o of ordens) {
    if (o.status !== "CONCLUÍDA" || o.valor_final == null) continue;
    const atual = m.get(o.veiculo_id) ?? { gasto: 0, ordens: 0 };
    atual.gasto += o.valor_final;
    atual.ordens += 1;
    m.set(o.veiculo_id, atual);
  }
  return m;
}

/**
 * A simulação de um veículo para a distância pedida.
 *
 * `null` em todo número que não dá para afirmar, nunca zero: zero diria que o
 * veículo roda de graça, que é exatamente a resposta errada para "qual sai mais
 * barato".
 */
function simularUm(
  km: number,
  v: FichaDoVeiculo,
  rodagem: Map<string, number>,
  gastos: Map<string, { gasto: number; ordens: number }>,
): Simulacao {
  const falta = faltaNaFicha(v);
  const combustivelPorKm = falta ? null : v.custo_km;
  const litros = falta ? null : km / v.consumo_km_l!;

  const kmRodado = rodagem.get(v.placa) ?? 0;
  const g = gastos.get(v.id) ?? { gasto: 0, ordens: 0 };
  // Rodou o bastante: a taxa vale, inclusive quando é zero — veículo que rodou
  // 20.000 km sem entrar na oficina custou mesmo R$ 0 por km de manutenção.
  const temBase = kmRodado >= KM_MINIMO_DE_BASE;
  const manutencaoPorKm = temBase ? g.gasto / kmRodado : null;

  const combustivel = combustivelPorKm == null ? null : km * combustivelPorKm;
  const manutencao = manutencaoPorKm == null ? null : km * manutencaoPorKm;

  return {
    id: v.id,
    placa: v.placa,
    modelo: v.modelo,
    status: v.status,
    consumo: v.consumo_km_l,
    precoDoLitro: v.valor_combustivel,
    litros,
    combustivelPorKm,
    combustivel,
    manutencaoPorKm,
    manutencao,
    total: combustivel == null || manutencao == null ? null : combustivel + manutencao,
    base: temBase ? { km: kmRodado, gasto: g.gasto, ordens: g.ordens } : null,
    falta,
    diferenca: null,
  };
}

/** O número pelo qual a linha é comparada, ou null quando ela fica de fora. */
export function valorDe(l: Simulacao, criterio: Criterio): number | null {
  return criterio === "total" ? l.total : l.combustivel;
}

/**
 * A comparação pronta: uma linha por veículo, da mais barata para a mais cara,
 * cada uma sabendo quanto custa a mais que a primeira.
 *
 * Quem não dá para comparar (falta ficha, ou falta histórico quando o critério
 * é o total) vai para o fim da lista com `diferenca` nula — some da conta, não
 * da tela. Veículo que não aparece é veículo que ninguém vai lembrar de
 * cadastrar.
 */
export function compararConsumo(
  km: number,
  veiculos: FichaDoVeiculo[],
  roteiros: RodagemRegistro[],
  ordens: OrdemRegistro[],
  criterio: Criterio = "combustivel",
): Simulacao[] {
  const rodagem = rodagemPorPlaca(roteiros);
  const gastos = gastoPorVeiculo(ordens);
  const linhas = veiculos.map((v) => simularUm(km, v, rodagem, gastos));

  const comparaveis = linhas.filter((l) => valorDe(l, criterio) != null);
  const maisBarato = comparaveis.length
    ? Math.min(...comparaveis.map((l) => valorDe(l, criterio)!))
    : null;

  for (const l of linhas) {
    const v = valorDe(l, criterio);
    l.diferenca = v == null || maisBarato == null ? null : v - maisBarato;
  }

  // Empate de valor desempata pela placa: sem isso a ordem muda a cada
  // carregamento e a tela parece instável sem nada ter mudado.
  return linhas.sort((a, b) => {
    const va = valorDe(a, criterio);
    const vb = valorDe(b, criterio);
    if (va == null && vb == null) return a.placa.localeCompare(b.placa);
    if (va == null) return 1;
    if (vb == null) return -1;
    return va - vb || a.placa.localeCompare(b.placa);
  });
}

/** A frase do rodapé: de onde a taxa de manutenção saiu. */
export function baseEmTexto(base: BaseDaManutencao | null): string {
  if (!base) return `rodou menos de ${KM_MINIMO_DE_BASE} km no período`;
  const ordens = base.ordens === 1 ? "1 ordem" : `${base.ordens} ordens`;
  return `${base.km.toLocaleString("pt-BR")} km rodados e ${ordens} no período`;
}

/**
 * Por que este veículo ficou de fora — e, quando dá, o que fazer a respeito.
 *
 * Duas razões bem diferentes: cadastro incompleto (o gestor conserta em
 * /veiculos) ou histórico curto (não tem o que consertar, mas a comparação por
 * combustível ainda responde). Dizer só "sem dados" misturaria as duas e
 * mandaria o gestor procurar um problema que não existe.
 */
export function motivoDeFicarDeFora(l: Simulacao, criterio: Criterio): string {
  if (l.falta) return l.falta;
  if (criterio === "total" && l.manutencaoPorKm == null) {
    return `${baseEmTexto(l.base)} — aparece na comparação por combustível`;
  }
  return "sem número para comparar";
}
