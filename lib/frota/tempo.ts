// Fuso horário da operação. Um lugar só.
//
// O banco guarda `timestamptz` (UTC). Cortar o texto ISO na mão ("2026-07-24T
// 22:30:00Z".slice(0,10)) mostra o horário de Greenwich: 3h adiantado, e o
// roteiro das 22h aparece como do dia seguinte. Todo texto de data/hora que a
// equipe lê passa por aqui.
//
// Nada de offset fixo `-3`: o `Intl.DateTimeFormat` com a zona nomeada resolve
// o horário de verão sozinho, se ele voltar.

const TZ = "America/Sao_Paulo";

// "2026-07-24" — dia sem hora, que já é o dia local. Não pode virar Date: o
// parser trata data pura como UTC e o dia recuaria.
const SO_DIA = /^\d{4}-\d{2}-\d{2}$/;

function instante(ts: string | Date | null | undefined): Date | null {
  if (!ts) return null;
  const d = ts instanceof Date ? ts : new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d;
}

// en-CA formata como "2026-07-24" — o mesmo ISO que os <input type="date">
// e os filtros do Supabase esperam.
const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const fmtDiaMes = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
});

/** "2026-07-24" — o dia em São Paulo. */
export function diaDe(ts: string | Date | null | undefined): string | null {
  if (typeof ts === "string" && SO_DIA.test(ts)) return ts;
  const d = instante(ts);
  return d ? fmtDia.format(d) : null;
}

/** "09:30" — a hora em São Paulo. */
export function horaDe(ts: string | Date | null | undefined): string | null {
  const d = instante(ts);
  return d ? fmtHora.format(d) : null;
}

/** "24/07 09:30" — dia e hora curtos, para lista. */
export function diaHoraDe(ts: string | Date | null | undefined): string | null {
  const d = instante(ts);
  return d ? `${fmtDiaMes.format(d)} ${fmtHora.format(d)}` : null;
}

/** "2026-07-24" a partir de um Date. Serve para preencher <input type="date">. */
export function diaISO(date: Date): string {
  return fmtDia.format(date);
}

/** O dia de hoje em São Paulo, "2026-07-24". */
export function hojeBR(): string {
  return diaISO(new Date());
}

// Quanto o relógio de São Paulo está atrás do UTC no instante dado, em ms.
function defasagemMs(quando: Date): number {
  const emSP = new Date(quando.toLocaleString("en-US", { timeZone: TZ }));
  const emUTC = new Date(quando.toLocaleString("en-US", { timeZone: "UTC" }));
  return emUTC.getTime() - emSP.getTime();
}

// Converte "2026-07-24" + hora local no instante UTC correspondente.
function instanteLocal(dia: string, horaISO: string): string {
  const palpite = new Date(`${dia}T${horaISO}Z`);
  return new Date(palpite.getTime() + defasagemMs(palpite)).toISOString();
}

/**
 * Os limites de um intervalo de dias locais, em UTC, para filtrar `timestamptz`.
 * Sem isso o filtro corta às 21h: um roteiro das 22h do último dia fica de fora.
 */
export function intervaloUTC(de: string, ate: string): { de: string; ate: string } {
  return {
    de: instanteLocal(de, "00:00:00.000"),
    ate: instanteLocal(ate, "23:59:59.999"),
  };
}

/**
 * "8h32" — quanto tempo passou entre dois instantes. Usado na conferência de
 * roteiro: é o número que o time de ponto compara com a marcação da folha.
 *
 * Calculado a partir dos dois `timestamptz`, não do texto: instante menos
 * instante não depende de fuso nem de o roteiro ter virado o dia.
 */
export function duracaoEntre(
  inicio: string | Date | null | undefined,
  fim: string | Date | null | undefined,
): string | null {
  const a = instante(inicio);
  const b = instante(fim);
  if (!a || !b) return null;
  const min = Math.round((b.getTime() - a.getTime()) / 60000);
  if (min < 0) return null;
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h${String(min % 60).padStart(2, "0")}` : `${min}min`;
}
