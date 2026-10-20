// Checklist de limpeza semanal, feito pela expedição.
//
// Mesma gramática da vistoria: item por item, conforme ou não conforme. A
// equipe já sabe preencher assim, e o que se ganha ensinando uma segunda
// gramática é nada.
//
// A lista de itens mora aqui e não no banco. São sete linhas que mudam de ano
// em ano, e uma tabela de cadastro para elas custaria uma tela de manutenção
// que ninguém pediu. Quando mudar, muda aqui — e o registro antigo guarda o
// que foi perguntado NAQUELE dia, porque o jsonb só tem as chaves que
// existiam. É o que permite a lista crescer sem reescrever o passado.

export const ITENS_LIMPEZA: [string, string][] = [
  ["lataria", "Lataria lavada, sem barro ou poeira"],
  ["vidros", "Vidros e retrovisores limpos"],
  ["cabine", "Cabine: painel, bancos e forração"],
  ["piso", "Piso e tapetes"],
  ["carga", "Área de carga: caçamba, baú ou porta-malas"],
  ["lixo", "Lixo e sobras de material retirados"],
  ["rodas", "Rodas e pneus sem acúmulo de sujeira"],
];

export const CONFORME = "CONFORME";
export const NAO_CONFORME = "NÃO CONFORME";

export type Limpeza = {
  id: string;
  veiculo_id: string;
  data: string;
  itens: Record<string, string>;
  observacao: string | null;
  fotos: string[];
  registrado_por: string | null;
};

/** Os itens que a expedição marcou como fora de conformidade. É o que vira a
 *  conversa com quem lava — e o que a foto precisa mostrar. */
export function naoConformes(itens: Record<string, string> | null | undefined): string[] {
  if (!itens) return [];
  return ITENS_LIMPEZA.filter(([k]) => itens[k] === NAO_CONFORME).map(([, texto]) => texto);
}

/** Quantos itens foram respondidos — o que separa "tudo conforme" de "ninguém
 *  preencheu". Os dois gravariam zero não-conformidades, e confundi-los faria
 *  um veículo nunca olhado parecer impecável. */
export function respondidos(itens: Record<string, string> | null | undefined): number {
  if (!itens) return 0;
  return ITENS_LIMPEZA.filter(([k]) => itens[k] === CONFORME || itens[k] === NAO_CONFORME).length;
}

/** A frase curta do cartão e da lista. */
export function resumoDaLimpeza(l: Limpeza): string {
  const fora = naoConformes(l.itens);
  const feitos = respondidos(l.itens);
  if (feitos === 0) return "sem itens respondidos";
  if (fora.length === 0) return `${feitos} itens, tudo conforme`;
  return `${fora.length} de ${feitos} fora de conformidade`;
}

/** Se o erro é "a 0029 ainda não rodou".
 *
 *  As migrações deste projeto são aplicadas à mão no SQL Editor, e nem sempre
 *  no mesmo dia em que o código sobe. Entre um e outro, a tela de limpeza não
 *  tem tabela para ler — e deve dizer isso em português, não quebrar. */
export function faltaMigracaoDaLimpeza(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  // PGRST205 = tabela desconhecida no schema que o PostgREST conhece;
  // 42P01 = undefined_table, quando o pedido chega ao Postgres.
  return erro.code === "PGRST205" || erro.code === "42P01" || /limpezas/i.test(erro.message ?? "");
}

// ---------------------------------------------------------------------------
// Lavagem mensal
// ---------------------------------------------------------------------------
// A lavagem é o SERVIÇO pago, mensal, num prestador — e por isso mora em
// `manutencoes` com tipo LAVAGEM, onde já existem valor, nota fiscal, oficina
// e ordem de serviço. A limpeza acima é a CONFERÊNCIA semanal da expedição,
// de graça, por dentro. Uma verifica, a outra executa.

export const TIPO_LAVAGEM = "LAVAGEM";

export type LavagemRegistro = {
  veiculo_id: string;
  status: string;
  agendada_para: string | null;
  concluida_em: string | null;
};

/** O mês-calendário de uma data: "2026-10". É assim que a equipe conta — a
 *  cobrança é "este mês já foi?", pergunta que uma janela de 30 dias não
 *  responde. */
export function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

/** Os veículos que ainda não têm lavagem neste mês — agendada ou feita.
 *
 *  Agendada conta: já está resolvida, marcar de novo criaria duplicata. A
 *  cancelada não conta, porque voltou a faltar. É a mesma regra do saldo dos
 *  pacotes, pela mesma razão. */
export function semLavagemNoMes<T extends { id: string }>(
  veiculos: T[],
  lavagens: LavagemRegistro[],
  mes: string,
): T[] {
  const cobertos = new Set<string>();
  for (const l of lavagens) {
    if (l.status === "CANCELADA") continue;
    const quando = l.concluida_em ?? l.agendada_para;
    if (quando && mesDe(quando) === mes) cobertos.add(l.veiculo_id);
  }
  return veiculos.filter((v) => !cobertos.has(v.id));
}

/**
 * O escopo da lavagem mensal: o que o lava-jato tem que fazer, item por item.
 *
 * Não é a mesma lista de `ITENS_LIMPEZA`, e isso é de propósito. Aquela é o que
 * a expedição CONFERE toda semana, por fora e de graça; esta é o que se COMPRA
 * uma vez por mês, e tem coisa que só entra no serviço pago — motor, chassi,
 * acabamento. Juntar as duas numa lista só faria o papel do lava-jato pedir
 * conferência e a conferência da expedição cobrar serviço.
 *
 * Mora aqui e não no banco pelo mesmo motivo da lista semanal: são oito linhas,
 * e uma tela de cadastro para elas é trabalho que ninguém pediu.
 */
export const ITENS_LAVAGEM: [string, string][] = [
  ["externa", "Lavagem externa: lataria, para-choques e vidros"],
  ["rodas", "Rodas, pneus e caixas de roda"],
  ["cabine", "Cabine aspirada: painel, console e bancos"],
  ["piso", "Piso e tapetes lavados"],
  ["carga", "Área de carga: caçamba, baú ou porta-malas"],
  ["motor", "Compartimento do motor — sem jato direto na parte elétrica"],
  ["chassi", "Chassi e parte de baixo"],
  ["acabamento", "Secagem e acabamento, sem marca de água no vidro"],
];

/**
 * O papel desta manutenção: a ordem de serviço, ou o formulário de lavagem.
 *
 * A lavagem usava a ordem de serviço da oficina, e o lava-jato recebia uma
 * folha pedindo peças substituídas, km na entrega e próxima revisão — três
 * coisas que não existem numa lavagem. Quem lê um papel que pergunta o que não
 * se aplica conclui, com razão, que o papel não é para ele.
 */
export function papelDaManutencao(tipo: string | null, id: string): string {
  return tipo === TIPO_LAVAGEM ? `/manutencao/lavagem?id=${id}` : `/manutencao/ordem?id=${id}`;
}

/** O rótulo do botão que imprime esse papel. */
export function rotuloDoPapel(tipo: string | null): string {
  return tipo === TIPO_LAVAGEM ? "Formulário de lavagem" : "Ordem de serviço";
}
