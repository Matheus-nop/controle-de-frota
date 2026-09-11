// As notas fiscais de uma manutenção.
//
// A oficina fatura o mesmo conserto em mais de uma nota: a peça sai como venda
// de mercadoria e a mão de obra como prestação de serviço — às vezes de CNPJs
// diferentes. Com um campo só, a segunda nota substituía a primeira, e a
// manutenção ficava com metade do custo comprovado. Na hora de conferir a
// fatura do mês, ou de acionar garantia de peça, é justamente a que sumiu que
// faz falta.
//
// DUAS FORMAS, COMO NAS AVARIAS
//
// A antiga era uma coluna só, `nota_fiscal_url`. A nova é `notas_fiscais`, uma
// lista. As manutenções antigas continuam como foram gravadas — não existe
// migração de dado aqui, de propósito. Quem lê é que aceita as duas formas, e é
// este arquivo.

/** Uma nota anexada à manutenção. */
export type Nota = {
  url: string;
  /** O que esta nota cobre. Nulo nas antigas e nas que ninguém classificou. */
  rotulo: string | null;
  em: string | null;
};

/** O que a oficina costuma emitir. Não é `check` no banco de propósito: nota de
 *  frete, de guincho e de terceiro aparecem, e recusar a nota por causa do
 *  rótulo seria perder o documento para ganhar a etiqueta. */
export const ROTULOS_NOTA = ["PEÇAS", "SERVIÇO", "OUTRO"];

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Só o que parece endereço de arquivo. O jsonb é livre e já passou por
 *  versões diferentes da tela. */
function endereco(v: unknown): string | null {
  return typeof v === "string" && v.startsWith("http") ? v : null;
}

/**
 * As notas da manutenção, nas duas formas que já existiram.
 *
 * A da coluna antiga entra primeiro e só se não estiver na lista: manutenção
 * que foi editada depois da mudança tem a mesma URL nos dois lugares, e
 * mostrá-la duas vezes faria alguém achar que existem duas notas.
 */
export function notasDe(m: { notas_fiscais?: unknown; nota_fiscal_url?: string | null } | null | undefined): Nota[] {
  if (!m) return [];
  const lista: Nota[] = [];
  if (Array.isArray(m.notas_fiscais)) {
    for (const item of m.notas_fiscais) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const url = endereco(o.url);
      if (!url) continue;
      lista.push({ url, rotulo: texto(o.rotulo), em: texto(o.em) });
    }
  }
  const antiga = endereco(m.nota_fiscal_url);
  if (antiga && !lista.some((n) => n.url === antiga)) {
    lista.unshift({ url: antiga, rotulo: null, em: null });
  }
  return lista;
}

/** Objeto solto para gravar no jsonb — campo nulo não vira chave. */
type NotaGravada = Record<string, unknown>;

/** O que a tela manda para o `update` da manutenção.
 *
 *  `nota_fiscal_url` vai a nulo junto, SEMPRE, e isso é proposital: a nota que
 *  estava lá entra na lista com a mesma URL, e deixar as duas preenchidas faria
 *  a coluna antiga ressuscitar a nota que alguém acabou de remover. A conversão
 *  acontece porque uma pessoa está editando este registro de propósito — não
 *  numa migração cega em cima de tudo. */
export type NotasParaGravar = { notas_fiscais: NotaGravada[]; nota_fiscal_url: null };

function paraGravar(notas: Nota[]): NotasParaGravar {
  return {
    notas_fiscais: notas.map((n) => ({ url: n.url, rotulo: n.rotulo, em: n.em })),
    nota_fiscal_url: null,
  };
}

/**
 * Acrescenta notas à manutenção, sem tirar as que já estavam.
 *
 * Devolve os dois campos do `update`. A nota da coluna antiga entra na lista —
 * é assim que ela passa para o formato novo, no dia em que alguém edita aquela
 * manutenção, e não numa migração cega.
 *
 * URL repetida não entra duas vezes: salvar a tela sem escolher arquivo novo é
 * o caminho normal, e não pode duplicar o que já está lá.
 */
export function anexarNotas(
  m: { notas_fiscais?: unknown; nota_fiscal_url?: string | null } | null | undefined,
  novas: { url: string; rotulo: string | null }[],
  agora: string = new Date().toISOString(),
): NotasParaGravar {
  const atuais = notasDe(m);
  const vistas = new Set(atuais.map((n) => n.url));
  for (const nova of novas) {
    const url = endereco(nova.url);
    if (!url || vistas.has(url)) continue;
    vistas.add(url);
    atuais.push({ url, rotulo: texto(nova.rotulo), em: agora });
  }
  return paraGravar(atuais);
}

/**
 * Tira uma nota da lista.
 *
 * O arquivo continua no Storage: quem removeu pode ter removido a errada, e
 * apagar documento fiscal por um clique não é coisa que se desfaça. Some da
 * manutenção, que é o que a tela promete.
 *
 * Vale para a nota do formato antigo também — e é por isso que `nota_fiscal_url`
 * vai a nulo no mesmo `update`. Sem isso, remover a nota antiga não removia
 * nada: a lista saía sem ela e a coluna a devolvia na leitura seguinte.
 */
export function removerNota(
  m: { notas_fiscais?: unknown; nota_fiscal_url?: string | null } | null | undefined,
  url: string,
): NotasParaGravar {
  return paraGravar(notasDe(m).filter((n) => n.url !== url));
}

/** Uma linha curta para o cartão: "PEÇAS · 11/09". */
export function resumoDaNota(n: Nota, i: number): string {
  const quando = n.em ? `${n.em.slice(8, 10)}/${n.em.slice(5, 7)}` : null;
  return [n.rotulo ?? `Nota ${i + 1}`, quando].filter(Boolean).join(" · ");
}

/** Se o erro é "a 0019 ainda não rodou".
 *
 *  As migrações deste projeto são aplicadas à mão no SQL Editor, e nem sempre no
 *  mesmo dia em que o código sobe. Entre um e outro, gravar `notas_fiscais`
 *  falha — e quem pagaria por isso seria o gestor, sem conseguir registrar o
 *  andamento de uma manutenção por causa de uma coluna que ele nem viu. A tela
 *  detecta e salva na coluna antiga, avisando o que ficou de fora. */
export function faltaMigracaoDasNotas(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  // PGRST204 = o PostgREST não achou a coluna no schema que ele conhece;
  // 42703 = undefined_column, quando o pedido chega ao Postgres.
  return (
    erro.code === "PGRST204" ||
    erro.code === "42703" ||
    /notas_fiscais/i.test(erro.message ?? "")
  );
}
