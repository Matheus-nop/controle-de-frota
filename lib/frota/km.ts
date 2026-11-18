// O km do roteiro: os limites e o que conferir quando o gestor corrige.
//
// O CASO
//
// "Era 212 e o rapaz digitou 2012."
//
// O roteiro saiu com um hodômetro que não existe, e aí a chegada não fecha: o
// banco recusa chegada menor que saída, com razão. O veículo fica "NA RUA" no
// painel, o técnico tenta de novo e falha de novo, e sem uma porta de correção
// o jeito vira SQL na mão — que foi o que a planilha fazia e é o que este
// sistema existe para acabar.
//
// A REGRA
//
// Quem corrige é o gestor, e a correção deixa rastro (`roteiros.correcoes`, a
// mesma lista que a vistoria usa). Trocar o km sem rastro apagaria a diferença
// entre "o veículo rodou 212 km" e "alguém DISSE depois que foram 212" — e
// essas duas frases não são a mesma coisa numa conversa sobre combustível.
//
// O QUE BARRA E O QUE SÓ AVISA
//
// Barra só o que o banco recusaria de qualquer jeito: assim o gestor lê uma
// frase em português em vez de "violates check constraint km_plausivel".
//
// O resto avisa. Quem chega aqui está consertando dado torto, muitas vezes de
// trás para frente (o roteiro de ontem também está errado, e ele vai arrumar os
// dois). Travar a correção porque o vizinho ainda está errado prenderia os dois
// para sempre. O aviso aparece, o gestor confirma marcando, e fica gravado.

import { emKm } from "./numero.ts";
import { dataBR, diaDe } from "./tempo.ts";

// As duas faixas, uma vez só. Elas também estão no banco — `km_plausivel`
// (0010) e o `> 600` da view v_roteiros — e por isso mudar aqui exige mudar lá.
//
// KM_AVISO: acima disso é incomum, mas acontece — Minas, litoral, uma entrega
// que virou o dia. Não barra: marca o roteiro como "km alto verificar" para o
// gestor conferir.
//
// KM_ABSURDO: acima disso não é viagem, é digitação — o hodômetro inteiro no
// lugar do km, um zero a mais. Mesmo teto da constraint `km_plausivel`.
export const KM_AVISO = 600;
export const KM_ABSURDO = 5000;

/** Um roteiro do mesmo veículo, do jeito que a conferência precisa dele. */
export type RoteiroDoVeiculo = {
  id: string;
  saida_em: string;
  km_saida: number;
  km_chegada: number | null;
};

/** O roteiro de antes e o de depois, no mesmo veículo. É contra eles que o km
 *  corrigido tem que fazer sentido — a corrente do hodômetro. */
export type Vizinhos = { anterior: RoteiroDoVeiculo | null; seguinte: RoteiroDoVeiculo | null };

/**
 * Acha os vizinhos pela saída, e não pelo km.
 *
 * Pelo km seria circular: o km é justamente o que está errado, e ordenar por
 * ele colocaria o roteiro de 2.012 km no lugar errado da fila — exatamente o
 * caso que se está consertando.
 */
export function vizinhosDoRoteiro(
  id: string,
  saidaEm: string,
  doVeiculo: RoteiroDoVeiculo[],
): Vizinhos {
  const outros = doVeiculo
    .filter((r) => r.id !== id)
    .sort((a, b) => a.saida_em.localeCompare(b.saida_em));
  let anterior: RoteiroDoVeiculo | null = null;
  let seguinte: RoteiroDoVeiculo | null = null;
  for (const r of outros) {
    if (r.saida_em < saidaEm) anterior = r;
    else if (seguinte === null) seguinte = r;
  }
  return { anterior, seguinte };
}

/** O último km conhecido de um roteiro: a chegada, ou a saída enquanto ele não
 *  fechou. */
export function ultimoKm(r: RoteiroDoVeiculo): number {
  return r.km_chegada ?? r.km_saida;
}

export type Conferencia = {
  /** O banco recusaria. O botão fica travado e a frase explica em português. */
  impedimentos: string[];
  /** Passa, mas o gestor tem que confirmar que viu. */
  avisos: string[];
  /** Quanto o roteiro passa a ter rodado. Null enquanto não fechou. */
  rodado: number | null;
};

/**
 * O que não fecha com os km propostos.
 *
 * Fora do componente para poder ser provado sem navegador: é a regra que decide
 * se o gestor pode gravar, e regra que decide não devia morar dentro de um
 * `return (`.
 */
export function conferirCorrecao(p: {
  kmSaida: number | null;
  kmChegada: number | null;
  vizinhos: Vizinhos;
}): Conferencia {
  const impedimentos: string[] = [];
  const avisos: string[] = [];
  const { kmSaida, kmChegada } = p;

  if (kmSaida == null) impedimentos.push("Informe o km de saída.");
  else if (kmSaida < 0) impedimentos.push("O km de saída não pode ser negativo.");
  if (kmChegada != null && kmChegada < 0) impedimentos.push("O km de chegada não pode ser negativo.");

  const rodado = kmSaida != null && kmChegada != null ? kmChegada - kmSaida : null;

  if (rodado != null && rodado < 0) {
    impedimentos.push(
      `A chegada (${emKm(kmChegada)}) ficaria menor que a saída (${emKm(kmSaida)}). ` +
        "Dentro do mesmo roteiro o hodômetro não anda para trás.",
    );
  }
  if (rodado != null && rodado > KM_ABSURDO) {
    impedimentos.push(
      `Dariam ${emKm(rodado)} rodados neste roteiro. Isso não é viagem, é digitação — ` +
        `o banco recusa acima de ${emKm(KM_ABSURDO)}.`,
    );
  }

  // A corrente do hodômetro: o que vem antes e o que vem depois, no mesmo
  // veículo. Aviso, e não trava — ver o cabeçalho.
  const { anterior, seguinte } = p.vizinhos;
  if (kmSaida != null && anterior) {
    const km = ultimoKm(anterior);
    if (kmSaida < km) {
      avisos.push(
        `A saída ficaria abaixo dos ${emKm(km)} do roteiro de ${dataBR(diaDe(anterior.saida_em))} ` +
          "desse veículo. Entre um roteiro e outro o hodômetro não volta.",
      );
    }
  }
  if (seguinte) {
    const fim = kmChegada ?? kmSaida;
    if (fim != null && fim > seguinte.km_saida) {
      avisos.push(
        `Passaria dos ${emKm(seguinte.km_saida)} com que o veículo saiu em ` +
          `${dataBR(diaDe(seguinte.saida_em))}, no roteiro seguinte.`,
      );
    }
  }

  if (rodado != null && rodado > KM_AVISO && rodado <= KM_ABSURDO) {
    avisos.push(
      `Ficam ${emKm(rodado)} rodados. O roteiro volta para a fila de km alto, para conferência.`,
    );
  }

  return { impedimentos, avisos, rodado };
}

/**
 * O que não fecha ao FECHAR o roteiro pelo gestor.
 *
 * É a mesma conferência da correção, mais a data: `chegada_coerente` (0001) não
 * aceita chegada antes da saída, e o gestor digita a data à mão — ele está
 * lançando uma chegada que aconteceu dias atrás, não agora.
 *
 * Por que isto existe: o técnico tentou fechar, o km passou de 600 e o app
 * pediu que ele confirmasse e dissesse para onde foi. Ele parou aí, e o veículo
 * ficou "NA RUA" no painel. O gestor conseguia corrigir o km e não conseguia
 * fechar — e sem uma porta aqui o jeito vira SQL na mão.
 */
export function conferirFechamento(p: {
  kmSaida: number;
  kmChegada: number | null;
  /** A saída, em ISO. Vem do banco. */
  saidaEm: string;
  /** A chegada que o gestor digitou, já em ISO. Null enquanto em branco. */
  chegadaEm: string | null;
  vizinhos: Vizinhos;
}): Conferencia {
  const base = conferirCorrecao({
    kmSaida: p.kmSaida,
    kmChegada: p.kmChegada,
    vizinhos: p.vizinhos,
  });
  const impedimentos = [...base.impedimentos];

  if (p.kmChegada == null) impedimentos.push("Informe o km de chegada.");
  if (!p.chegadaEm) impedimentos.push("Informe quando o veículo voltou.");
  else if (Date.parse(p.chegadaEm) < Date.parse(p.saidaEm)) {
    impedimentos.push("A chegada não pode ser antes da saída.");
  }

  return { ...base, impedimentos };
}

/** Como o km aparece na lista de correções: "2.012 km". */
export function kmParaORastro(n: number | null): string | null {
  return n == null ? null : emKm(n);
}
