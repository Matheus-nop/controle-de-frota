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
  /** Preenchidos só quando a avaria NÃO foi registrada em campo: o gestor
   *  reclassificou uma foto que o técnico mandou como semanal. A tela mostra
   *  essa marca — avaria vista na rua e avaria reconhecida depois, na mesa, não
   *  valem a mesma coisa numa discussão sobre quando o dano apareceu. */
  reclassificada_por: string | null;
  reclassificada_em: string | null;
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
    reclassificada_por: texto(o.reclassificada_por),
    reclassificada_em: texto(o.reclassificada_em),
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

/* ------------------------------------------------------ reclassificação */
//
// O técnico manda TODAS as fotos como "semanais" — as quatro da volta do
// veículo e, no meio delas, o farol quebrado e o amassado da porta. Aconteceu
// na primeira semana de uso: onze fotos, várias de dano, todas marcadas como
// semanal. A vistoria fica com zero avaria, o alerta não dispara e o
// comparativo da semana seguinte não tem com o que comparar.
//
// Exigir que o técnico refaça a vistoria seria pior: ele já entregou o veículo
// e foi para a rua. Quem consegue olhar a foto e dizer "isto é a traseira
// amassada" é o gestor, depois, na mesa.
//
// ISTO NÃO É REESCREVER O PASSADO
//
// A foto continua exatamente a mesma, tirada na mesma hora. O que muda é a
// CLASSIFICAÇÃO dela, e a mudança fica assinada: `reclassificada_por` e
// `reclassificada_em` em toda avaria criada assim. A tela mostra a marca, e
// numa discussão sobre quando o dano apareceu, "o gestor reconheceu depois" e
// "o técnico registrou na hora" continuam sendo coisas diferentes.
//
// O que NÃO se pode fazer por aqui é inventar foto ou apagar foto. As duas
// funções abaixo só movem URLs entre duas listas do mesmo registro.

/** Objeto solto para gravar no jsonb. Não usa `Avaria` porque o jsonb guarda
 *  só o que foi preenchido — campo nulo não vira chave. */
type AvariaGravada = Record<string, unknown>;

function listaDeAvarias(itens: Record<string, unknown>): AvariaGravada[] {
  // CÓPIA, e não a lista de dentro. Devolver a referência original fazia o
  // `push` da reclassificação escrever no objeto que veio de fora: reclassificar
  // duas fotos em seguida deixava a primeira versão com a avaria da segunda, e
  // a contagem de fotos passava a não fechar. Só apareceu porque o teste
  // conferia o total de fotos antes e depois.
  if (Array.isArray(itens.avarias)) return (itens.avarias as AvariaGravada[]).map((a) => ({ ...a }));
  // Registro na forma antiga: a avaria única vira o primeiro item da lista, e
  // a chave velha sai. Aqui a conversão é legítima — está acontecendo porque
  // alguém está editando este registro de propósito, não numa migração cega.
  const antiga = uma(itens.avaria);
  return antiga ? [{ ...antiga }] : [];
}

/**
 * Move fotos de `fotos_semanais` para uma avaria nova.
 *
 * Devolve o `itens` novo. Não toca no banco: quem grava é a tela, e assim esta
 * regra pode ser testada sem Supabase nenhum.
 */
export function reclassificarComoAvaria(
  itens: unknown,
  fotosEscolhidas: string[],
  dados: { onde: string | null; tipo: string | null; descricao: string | null },
  quem: string | null,
  agora: string = new Date().toISOString(),
): Record<string, unknown> {
  const base = (itens && typeof itens === "object" ? { ...(itens as Record<string, unknown>) } : {}) as Record<
    string,
    unknown
  >;
  const semanais = urls(base.fotos_semanais);
  const escolhidas = fotosEscolhidas.filter((u) => semanais.includes(u));
  if (escolhidas.length === 0) return base;

  const avarias = listaDeAvarias(base);
  avarias.push({
    onde: dados.onde || null,
    tipo: dados.tipo || null,
    ja_existia: null,
    descricao: dados.descricao || null,
    fotos: escolhidas,
    reclassificada_por: quem || "gestor",
    reclassificada_em: agora,
  });

  base.avarias = avarias;
  delete base.avaria; // a chave antiga não convive com a lista
  base.fotos_semanais = semanais.filter((u) => !escolhidas.includes(u));
  // `nova_avaria` é o que o técnico respondeu. Passa a SIM porque a vistoria
  // agora tem avaria — senão a tela diria "não há avaria" com avaria na lista.
  base.nova_avaria = "SIM";
  return base;
}

/**
 * Desfaz uma reclassificação: as fotos voltam para as semanais e a avaria sai.
 *
 * Só desfaz o que o gestor criou. Avaria registrada em campo pelo técnico não
 * se apaga por aqui — corrigir o que outra pessoa viu na rua é outra conversa,
 * e não é a que esta tela resolve.
 */
export function desfazerReclassificacao(itens: unknown, indice: number): Record<string, unknown> {
  const base = (itens && typeof itens === "object" ? { ...(itens as Record<string, unknown>) } : {}) as Record<
    string,
    unknown
  >;
  const avarias = listaDeAvarias(base);
  const alvo = avarias[indice];
  if (!alvo || !texto(alvo.reclassificada_por)) return base;

  base.fotos_semanais = [...urls(base.fotos_semanais), ...urls(alvo.fotos)];
  const restantes = avarias.filter((_, i) => i !== indice);
  base.avarias = restantes;
  delete base.avaria;
  if (restantes.length === 0) base.nova_avaria = "NÃO";
  return base;
}
