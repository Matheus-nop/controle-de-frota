// Pacote de revisão: o que o prestador vendeu junto com o serviço.
//
// O caso que originou isto: alinhamento e balanceamento comprados na FULL
// PNEUS, com direito a seis revisões gratuitas. Sem registro, o saldo vence
// sem ser usado.
//
// IMPORTANTE — este arquivo NÃO recalcula saldo nem próxima prevista. Esses
// números vêm prontos da view `v_pacotes_revisao` (migração 0027), que é a
// única fonte de verdade. Aqui só se classifica e se escreve em português o
// que a view já disse. Reimplementar a conta em TypeScript criaria duas
// respostas para a mesma pergunta, e elas divergiriam no primeiro caso de
// borda — foi o erro que o projeto evita desde a regra do km_rodado.

/** Uma linha de `v_pacotes_revisao`. */
export type Pacote = {
  id: string;
  veiculo_id: string;
  placa: string;
  modelo: string;
  km_atual: number | null;
  prestador: string;
  servico: string;
  contratado_em: string;
  km_contratado: number | null;
  revisoes_gratuitas: number;
  cada_km: number | null;
  cada_dias: number | null;
  vence_em: string | null;
  observacao: string | null;
  encerrado_em: string | null;
  usadas: number;
  restantes: number;
  ultima_em: string | null;
  ultimo_km: number | null;
  proxima_em: string | null;
  proxima_km: number | null;
  dias_para_vencer: number | null;
};

/** Os mesmos limiares do ramo de alerta da migração 0027. Mudou aqui, muda lá
 *  — e o teste `pacote.test.ts` compara os dois contra o mesmo caso. */
export const DIAS_CRITICO = 15;
export const DIAS_AVISO = 45;

export type Situacao =
  | "ENCERRADO"
  | "ESGOTADO"
  | "VENCIDO"
  | "VENCE EM BREVE"
  | "REVISÃO VENCIDA"
  | "EM DIA";

/** A próxima revisão já passou do ponto, por data ou por km. */
export function revisaoVencida(p: Pacote): boolean {
  const porData = p.proxima_em != null && p.proxima_em <= hoje();
  const porKm =
    p.proxima_km != null && p.km_atual != null && p.km_atual >= p.proxima_km;
  return porData || porKm;
}

/** A ordem importa: um pacote esgotado não "vence", e um encerrado não é nada
 *  disso. Da condição mais definitiva para a mais branda. */
export function situacaoDoPacote(p: Pacote): Situacao {
  if (p.encerrado_em) return "ENCERRADO";
  if (p.restantes <= 0) return "ESGOTADO";
  if (p.dias_para_vencer != null && p.dias_para_vencer < 0) return "VENCIDO";
  if (p.dias_para_vencer != null && p.dias_para_vencer <= DIAS_AVISO) return "VENCE EM BREVE";
  if (revisaoVencida(p)) return "REVISÃO VENCIDA";
  return "EM DIA";
}

/** Se o alerta da 0027 estaria na fila para este pacote. Existe para o teste
 *  provar que a tela e o banco concordam sobre o que é urgente. */
export function entraNaFilaDeAlertas(p: Pacote): boolean {
  if (p.restantes <= 0 || p.encerrado_em) return false;
  if (p.vence_em != null && p.vence_em < hoje()) return false;
  const vencendo = p.dias_para_vencer != null && p.dias_para_vencer <= DIAS_AVISO;
  return vencendo || revisaoVencida(p);
}

/** "3 de 6 usadas · sobram 3" */
export function saldoDoPacote(p: Pacote): string {
  return `${p.usadas} de ${p.revisoes_gratuitas} usadas · ${
    p.restantes === 1 ? "sobra 1" : `sobram ${p.restantes}`
  }`;
}

/** A linha que diz quando é a próxima, com o que o prestador deu de cadência.
 *  Nulo quando ele não deu nenhuma — e aí não há o que prever.
 *
 *  Uma data sozinha e no passado não se denuncia: "Próxima: 12/05" parece
 *  agenda, não atraso. Por isso a linha diz quantos dias passaram. */
export function proximaDoPacote(p: Pacote): string | null {
  if (p.restantes <= 0) return null;
  const partes: string[] = [];
  if (p.proxima_km != null) partes.push(`${p.proxima_km.toLocaleString("pt-BR")} km`);
  if (p.proxima_em != null) partes.push(dataBR(p.proxima_em));
  if (partes.length === 0) return null;
  // Com as duas cadências, o que vencer primeiro manda — é como a oficina fala.
  const quando = partes.join(" ou ") + (partes.length > 1 ? ", o que vier primeiro" : "");
  const atraso = p.proxima_em != null ? diasDesde(p.proxima_em) : 0;
  if (atraso <= 0) return quando;
  return `${quando} — passou ${atraso} dia${atraso === 1 ? "" : "s"}`;
}

/** Quantos dias já se passaram desde a data. Negativo se ainda está no futuro. */
export function diasDesde(iso: string): number {
  const d = Date.parse(iso + "T00:00:00Z");
  const h = Date.parse(hoje() + "T00:00:00Z");
  return Math.round((h - d) / 864e5);
}

/** "vence" ou "venceu", conforme a data. Escrever sempre "vence" para algo que
 *  já passou faz o cartão mentir no único ponto que importa. */
export function venceOuVenceu(iso: string): string {
  return `${diasDesde(iso) > 0 ? "venceu" : "vence"} ${dataBR(iso)}`;
}

/** Se o erro é "a 0027 ainda não rodou".
 *
 *  As migrações deste projeto são aplicadas à mão no SQL Editor, e nem sempre
 *  no mesmo dia em que o código sobe. Entre um e outro, a tela de revisões não
 *  tem tabela para ler — e deve dizer isso em português, não quebrar. */
export function faltaMigracaoDosPacotes(erro: { code?: string; message?: string } | null): boolean {
  if (!erro) return false;
  // PGRST205 = tabela/view desconhecida no schema que o PostgREST conhece;
  // 42P01 = undefined_table, quando o pedido chega ao Postgres;
  // PGRST204/42703 = a coluna nova (agendada_para, pacote_id) não existe.
  return (
    erro.code === "PGRST205" ||
    erro.code === "42P01" ||
    erro.code === "PGRST204" ||
    erro.code === "42703" ||
    /pacotes_revisao|v_pacotes_revisao|agendada_para|pacote_id/i.test(erro.message ?? "")
  );
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

function dataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
