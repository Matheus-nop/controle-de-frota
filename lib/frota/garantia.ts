// Garantia: quando o serviço não se paga, e de quem é a cobertura.
//
// Nulo é "não é garantia". Preenchido é "é garantia, e é desta" — não existe
// estado pela metade, porque é uma coluna só (ver a migração 0024).

/** As coberturas possíveis. A ordem é a da frequência real: a oficina refazendo
 *  o próprio serviço é o caso do dia a dia; fábrica e fornecedor são raros. */
export const GARANTIAS = [
  "RETRABALHO DA OFICINA",
  "FÁBRICA/CONCESSIONÁRIA",
  "FORNECEDOR DA PEÇA",
] as const;

export type Garantia = (typeof GARANTIAS)[number];

/** Se o valor gravado é uma cobertura que a gente conhece. Vale para o que veio
 *  do banco: uma manutenção antiga tem nulo, e um valor estranho (digitado
 *  direto no SQL Editor, por exemplo) não deve virar badge. */
export function ehGarantia(valor: string | null | undefined): valor is Garantia {
  return !!valor && (GARANTIAS as readonly string[]).includes(valor);
}

/** O texto curto do cartão e da lista. */
export function rotuloDaGarantia(valor: string | null | undefined): string | null {
  if (!ehGarantia(valor)) return null;
  return valor === "RETRABALHO DA OFICINA" ? "GARANTIA · RETRABALHO" : "GARANTIA";
}

/** A frase que vai no papel que a oficina recebe. O papel é o único lugar onde
 *  isto precisa ser impossível de não ver: quem está com a ordem na mão é quem
 *  vai (ou não) emitir a cobrança. */
export function avisoDaGarantia(valor: string | null | undefined): string | null {
  switch (valor) {
    case "RETRABALHO DA OFICINA":
      return "Serviço em garantia — retrabalho da própria oficina. Não cobrar.";
    case "FÁBRICA/CONCESSIONÁRIA":
      return "Serviço em garantia de fábrica — a cobrança vai para a concessionária, não para a frota.";
    case "FORNECEDOR DA PEÇA":
      return "Peça em garantia do fornecedor — a reposição não é cobrada da frota.";
    default:
      return null;
  }
}

/** Se o erro é "a 0024 ainda não rodou".
 *
 *  As migrações deste projeto são aplicadas à mão no SQL Editor, e nem sempre no
 *  mesmo dia em que o código sobe. Entre um e outro, gravar `garantia` falha — e
 *  quem pagaria por isso seria o gestor, sem conseguir abrir uma manutenção por
 *  causa de uma coluna que ele nem viu. A tela detecta, salva sem a garantia e
 *  avisa o que ficou de fora. */
export function faltaMigracaoDaGarantia(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  // PGRST204 = o PostgREST não achou a coluna no schema que ele conhece;
  // 42703 = undefined_column, quando o pedido chega ao Postgres.
  return erro.code === "PGRST204" || erro.code === "42703" || /garantia/i.test(erro.message ?? "");
}
