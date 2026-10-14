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
