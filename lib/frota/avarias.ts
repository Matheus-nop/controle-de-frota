// As avarias de um checklist, em um lugar só.
//
// O checklist guarda tudo num `jsonb` (`checklists.itens`), e esse jsonb já teve
// duas formas. A primeira aceitava UMA avaria por vistoria:
//
//   { nova_avaria: "SIM", avaria: { onde, tipo, ja_existia, descricao, fotos } }
//
// Isso bastava para registrar, e não bastava para comparar. "Ontem a Strada tinha
// duas avarias, hoje tem três" é a pergunta que a equipe faz, e com um campo só
// ela não tem resposta: o segundo dano do dia sobrescrevia o primeiro ou virava
// texto solto na descrição. A forma nova guarda uma lista:
//
//   { nova_avaria: "SIM", avarias: [ {...}, {...}, {...} ] }
//
// Os checklists antigos continuam no banco do jeito que foram gravados — não
// existe migração de dado aqui, de propósito. Vistoria é registro do que alguém
// viu num dia; reescrever o passado para caber num formato novo é perder a
// prova, que é justamente para o que essas fotos servem. Quem lê é que aceita as
// duas formas, e é esta função.

/** Uma avaria vista numa vistoria. Todos os campos são opcionais: o formulário
 *  mudou com o tempo e o `jsonb` não obriga nada. */
export type Avaria = {
  onde: string | null;
  tipo: string | null;
  ja_existia: string | null;
  descricao: string | null;
  fotos: string[];
};

/** Só o que parece endereço de foto. O jsonb é livre e já passou por versões
 *  diferentes do formulário — o que não for URL não vira `<img src>`. */
export function urls(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.startsWith("http"));
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function uma(v: unknown): Avaria | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const a: Avaria = {
    onde: texto(o.onde),
    tipo: texto(o.tipo),
    ja_existia: texto(o.ja_existia),
    descricao: texto(o.descricao),
    fotos: urls(o.fotos),
  };
  // Objeto vazio não é avaria. O formulário antigo gravava `avaria: {}` quando
  // alguém marcava SIM e voltava atrás sem preencher nada.
  const vazia = !a.onde && !a.tipo && !a.descricao && a.fotos.length === 0;
  return vazia ? null : a;
}

/**
 * As avarias de um checklist, nas duas formas que já existiram.
 *
 * A lista nova tem precedência: se um checklist tiver as duas chaves (só
 * aconteceria num registro escrito por versões diferentes ao mesmo tempo), a
 * lista é a que o formulário atual gravou.
 */
export function avariasDe(itens: unknown): Avaria[] {
  if (!itens || typeof itens !== "object") return [];
  const o = itens as Record<string, unknown>;

  if (Array.isArray(o.avarias)) {
    return o.avarias.map(uma).filter((a): a is Avaria => a !== null);
  }
  const antiga = uma(o.avaria);
  return antiga ? [antiga] : [];
}

/** Quantas avarias a vistoria registrou. É o número que o alerta compara. */
export function quantasAvarias(itens: unknown): number {
  return avariasDe(itens).length;
}

/** Uma linha curta para caber num cartão: "TRASEIRA · AMASSADO". */
export function resumoDaAvaria(a: Avaria): string {
  return [a.onde, a.tipo].filter(Boolean).join(" · ") || a.descricao || "avaria sem detalhe";
}
