// Dar ciência num alerta.
//
// COMO A FILA DE ALERTAS FUNCIONA
//
// `v_alertas_ativos` não guarda nada. É uma view: a cada vez que a tela abre, os
// cinco alertas são recalculados a partir dos dados de verdade. Não existe fila
// que cresce — existe uma pergunta refeita. O alerta de avaria, por exemplo,
// compara as duas últimas vistorias do veículo e some sozinho quando a vistoria
// seguinte registra a mesma quantidade de dano, quando passa de 60 dias, ou
// quando a vistoria é anulada.
//
// O QUE A CIÊNCIA RESOLVE
//
// Entre o alerta aparecer e a vistoria seguinte pode passar uma semana, e nessa
// semana ele fica vermelho na tela depois de o gestor já ter visto e resolvido.
// Alerta que continua vermelho depois de resolvido ensina a ignorar a tela — e
// o dia em que ele importar de verdade, ninguém vai olhar.
//
// A ciência não apaga nem muda dado nenhum: diz "eu vi este alerta". Fica
// gravada com quem viu, quando e por quê.
//
// A CHAVE É A OCORRÊNCIA, E NÃO O VEÍCULO
//
// Cada alerta carrega uma `referencia` — para AVARIA, o id da vistoria que o
// disparou. Se na semana seguinte outra vistoria achar mais dano, a referência é
// outra e o alerta volta. Dar ciência silencia o que você viu, e nunca o
// próximo: sem isso, um clique distraído cegaria o veículo para sempre.

export type Alerta = {
  tipo: string;
  gravidade: string;
  ordem: number;
  veiculo_id: string;
  placa: string;
  modelo: string;
  titulo: string;
  detalhe: string | null;
  desde: string | null;
  /** A ocorrência que disparou este alerta. Ausente antes da 0018. */
  referencia?: string | null;
  ciencia_por?: string | null;
  ciencia_em?: string | null;
  ciencia_observacao?: string | null;
};

/** Se o erro é "a 0018 ainda não rodou".
 *
 *  `42703` (coluna inexistente) está na lista por um motivo concreto: a primeira
 *  versão desta migração chamou a view de `v_alertas` — nome que JÁ EXISTIA
 *  desde a 0002, com outro significado. A migração foi recusada pelo banco, a
 *  tela pediu `order=ordem` numa view que não tem essa coluna, e foi este código
 *  que segurou a tela de pé até a correção. A view passou a se chamar
 *  `v_alertas_com_ciencia`.
 *
 *  As migrações deste projeto são aplicadas à mão no SQL Editor, e nem sempre no
 *  mesmo dia em que o código sobe. Entre um e outro a tela pede uma view que não
 *  existe — e quem pagaria por isso seria o gestor, com a fila de alertas vazia
 *  por motivo errado. A tela tenta a nova e volta para a antiga. */
export function faltaMigracaoDaCiencia(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  // 42P01 = relação inexistente; PGRST205 = o PostgREST não achou a tabela no
  // schema que ele conhece.
  return (
    erro.code === "42P01" ||
    erro.code === "PGRST205" ||
    erro.code === "42703" ||
    /v_alertas_com_ciencia|referencia|alertas_ciencia/i.test(erro.message ?? "")
  );
}

/** A ciência já dada, ou `null` quando o alerta continua pendente. */
export function cienciaDe(a: Alerta): { por: string | null; em: string; observacao: string | null } | null {
  return a.ciencia_em ? { por: a.ciencia_por ?? null, em: a.ciencia_em, observacao: a.ciencia_observacao ?? null } : null;
}
