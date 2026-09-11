// A vistoria anulada, e o cuidado de não quebrar antes da migração.
//
// As migrações deste projeto são aplicadas à mão no SQL Editor, e nem sempre no
// mesmo dia em que o código sobe. Entre o deploy e o `alter table` da 0017,
// toda consulta que pedir `anulada_em` volta com erro — e quem pagaria por isso
// seria o técnico, na rua, com a tela do checklist vazia.
//
// Então as telas pedem a coluna e, se ela ainda não existir, refazem a consulta
// sem ela. Some o filtro de anulada (não há anulada nenhuma para esconder,
// afinal) e o resto continua funcionando.

/** Se o erro é "esta coluna ainda não existe" — ou seja, falta rodar a 0017. */
export function faltaMigracaoDaAnulacao(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  // 42703 = undefined_column; PGRST200 = o PostgREST não achou a relação
  // `anulada_por -> tecnicos`, que é como ele reclama do join embutido.
  return (
    erro.code === "42703" ||
    erro.code === "PGRST200" ||
    /anulada_em|anulada_por|motivo_anulacao/i.test(erro.message ?? "")
  );
}
