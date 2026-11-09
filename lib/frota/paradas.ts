// Onde o veículo ficou quando não esteve com a gente.
//
// O CASO
//
// A Scudo passou dois períodos de 2026 na ITAVEMA, em manutenção corretiva, e
// a concessionária rodou com ela em rodovia para testar. Multa tirada nesses
// dias chega no nome da empresa, e o condutor a indicar não é ninguém da
// equipe. Sem registro, a defesa depende de alguém lembrar; com registro, a
// data da multa responde sozinha de quem o veículo estava.
//
// A PERGUNTA QUE ISTO RESPONDE
//
// "Chegou uma multa de 12/09. Quem estava com o veículo?" É essa pergunta que
// custa dinheiro quando fica sem resposta — e é por isso que `quemEstavaCom`
// mora aqui, com teste, e não dentro de um `return (`.

import { dataBR, diaDe } from "./tempo.ts";

export type Parada = {
  id: string;
  veiculo_id: string;
  de: string;
  /** Null enquanto o veículo não voltou — igual a `chegada_em` no roteiro. */
  ate: string | null;
  onde: string;
  motivo: string;
  observacao: string | null;
};

/** Um roteiro do veículo, do jeito que a consulta por data precisa dele. */
export type RoteiroNoDia = {
  id: string;
  saida_em: string;
  chegada_em: string | null;
  tecnico_saida: string | null;
  tecnico_chegada: string | null;
};

/** Se a parada cobre esse dia. Os dois extremos contam: o dia em que o veículo
 *  saiu e o dia em que voltou são dias em que ele esteve lá. */
export function cobre(p: Parada, dia: string): boolean {
  return p.de <= dia && (p.ate === null || dia <= p.ate);
}

/** A parada aberta — o veículo ainda não voltou. */
export function emAndamento(p: Parada): boolean {
  return p.ate === null;
}

/** As paradas que cobrem o dia. Mais de uma é erro de cadastro, não um caso
 *  normal; quem chama mostra todas em vez de escolher uma. */
export function paradasNoDia(paradas: Parada[], dia: string): Parada[] {
  return paradas.filter((p) => cobre(p, dia));
}

/** O dia em que o roteiro aconteceu, e o em que ele fechou. Roteiro que vira o
 *  dia cobre os dois. */
function diasDoRoteiro(r: RoteiroNoDia): [string, string] {
  const inicio = diaDe(r.saida_em) ?? "";
  const fim = diaDe(r.chegada_em) ?? inicio;
  return [inicio, fim];
}

/** Os roteiros que cobrem o dia. */
export function roteirosNoDia(roteiros: RoteiroNoDia[], dia: string): RoteiroNoDia[] {
  return roteiros.filter((r) => {
    const [inicio, fim] = diasDoRoteiro(r);
    return !!inicio && inicio <= dia && dia <= fim;
  });
}

export type Resposta = {
  /** `terceiro` quando havia parada; `equipe` quando havia roteiro; `nada`
   *  quando o dia não tem registro nenhum. */
  tipo: "terceiro" | "equipe" | "nada";
  paradas: Parada[];
  roteiros: RoteiroNoDia[];
  /** Os nomes a indicar, já sem repetição e na ordem em que aparecem. */
  condutores: string[];
};

/**
 * Quem estava com o veículo neste dia.
 *
 * Quando há parada E roteiro no mesmo dia, devolve os DOIS. É contradição, não
 * empate: ou a data da parada está errada, ou alguém lançou roteiro num
 * veículo que estava na concessionária. Escolher um dos dois calado seria o
 * pior desfecho possível — a empresa indicaria o condutor errado ao órgão de
 * trânsito com a própria base dizendo o contrário.
 */
export function quemEstavaCom(
  dia: string,
  paradas: Parada[],
  roteiros: RoteiroNoDia[],
): Resposta {
  const ps = paradasNoDia(paradas, dia);
  const rs = roteirosNoDia(roteiros, dia);
  const condutores: string[] = [];
  for (const r of rs) {
    for (const nome of [r.tecnico_saida, r.tecnico_chegada]) {
      if (nome && !condutores.includes(nome)) condutores.push(nome);
    }
  }
  return {
    tipo: ps.length > 0 ? "terceiro" : rs.length > 0 ? "equipe" : "nada",
    paradas: ps,
    roteiros: rs,
    condutores,
  };
}

/** A linha da parada na tela: "ITAVEMA · 25/08/2026 a 13/10/2026 · manutenção corretiva". */
export function resumoDaParada(p: Parada): string {
  const periodo = p.ate ? `${dataBR(p.de)} a ${dataBR(p.ate)}` : `desde ${dataBR(p.de)}`;
  return `${p.onde} · ${periodo} · ${p.motivo.toLowerCase()}`;
}

/** Quantos dias a parada durou (ou dura até hoje). Conta os dois extremos: um
 *  veículo que saiu e voltou no mesmo dia ficou um dia fora, não zero. */
export function diasDaParada(p: Parada, hoje: string): number {
  const fim = p.ate ?? hoje;
  const ms = Date.parse(fim + "T00:00:00Z") - Date.parse(p.de + "T00:00:00Z");
  return Math.floor(ms / 86400000) + 1;
}

/**
 * O que não fecha na parada que está sendo registrada.
 *
 * Avisos, e não impedimentos — mesma razão da correção de km: quem está
 * lançando um período de três meses atrás pode estar justamente consertando o
 * que já existe, e travar faria o registro não acontecer.
 */
export function avisosDaParada(p: {
  de: string | null;
  ate: string | null;
  onde: string;
  outras: Parada[];
  roteiros: RoteiroNoDia[];
}): string[] {
  const avisos: string[] = [];
  if (!p.de) return avisos;
  const de = p.de;
  const ate = p.ate ?? "9999-12-31";

  const choque = p.outras.filter((o) => o.de <= ate && (o.ate ?? "9999-12-31") >= de);
  for (const o of choque) {
    avisos.push(`O período se cruza com ${resumoDaParada(o)}.`);
  }

  // Roteiro dentro do período é a contradição que mais importa: é ela que
  // derruba a defesa da multa se alguém conferir.
  const dentro = p.roteiros.filter((r) => {
    const [inicio] = diasDoRoteiro(r);
    return !!inicio && inicio >= de && inicio <= ate;
  });
  if (dentro.length > 0) {
    const quando = dentro
      .map((r) => dataBR(diaDe(r.saida_em)))
      .slice(0, 3)
      .join(", ");
    avisos.push(
      `Há ${dentro.length} roteiro(s) da equipe dentro do período (${quando}${
        dentro.length > 3 ? "…" : ""
      }). Com o veículo em ${p.onde || "terceiro"}, um dos dois registros está errado.`,
    );
  }
  return avisos;
}

/** Se o erro é "a 0033 ainda não rodou".
 *
 *  As migrações deste projeto são aplicadas à mão no SQL Editor, e nem sempre
 *  no mesmo dia em que o código sobe. Entre um e outro a tela não tem tabela
 *  para ler — e deve dizer isso em português, não quebrar. */
export function faltaMigracaoDasParadas(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  // PGRST205 = tabela desconhecida no schema que o PostgREST conhece;
  // 42P01 = undefined_table, quando o pedido chega ao Postgres.
  return erro.code === "PGRST205" || erro.code === "42P01" || /paradas/i.test(erro.message ?? "");
}
