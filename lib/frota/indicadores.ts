// Os números que vão para a reunião.
//
// Tudo aqui é função pura sobre o que as telas já carregam: nada consulta o
// banco, nada guarda estado. É o que permite testar cada taxa contra um caso
// montado à mão, em vez de conferir no olho um gráfico bonito.
//
// A palavra "adesão" quer dizer uma coisa só: do que DEVIA ter sido
// registrado, quanto foi. Por isso toda taxa aqui tem denominador explícito —
// uma porcentagem sem denominador é um número que ninguém sabe contestar numa
// reunião, e é justamente ali que ela precisa aguentar pergunta.

import { quantasAvarias } from "./avarias";

export type Taxa = {
  /** O nome da linha: o técnico, a placa. */
  chave: string;
  /** O que foi efetivamente registrado. */
  feito: number;
  /** O que era esperado. Zero significa "não dá para cobrar nada". */
  esperado: number;
  /** De 0 a 100, já arredondado. Nulo quando não há o que esperar. */
  pct: number | null;
};

function taxa(chave: string, feito: number, esperado: number): Taxa {
  return {
    chave,
    feito,
    esperado,
    pct: esperado > 0 ? Math.round((feito / esperado) * 100) : null,
  };
}

// ---------------------------------------------------------------------------
// 1. Adesão ao registro de roteiro
// ---------------------------------------------------------------------------
// O técnico registra a saída e, na volta, a chegada. O roteiro sem chegada é o
// buraco: o km não fecha, a duração não existe, e o veículo fica eternamente
// "na rua". A adesão é a fração dos roteiros dele que chegaram a fechar.
//
// O denominador é o roteiro que ELE abriu — e não um alvo inventado de quantos
// roteiros cada um deveria fazer por semana. Cobrar "fez poucos roteiros" seria
// outra conversa, e ela não se mede aqui.

export type RoteiroRegistro = {
  tecnico_saida: string | null;
  chegada_em: string | null;
};

export function adesaoDeRoteiro(roteiros: RoteiroRegistro[]): Taxa[] {
  const mapa = new Map<string, { feito: number; esperado: number }>();
  for (const r of roteiros) {
    const nome = r.tecnico_saida || "sem técnico";
    const l = mapa.get(nome) ?? { feito: 0, esperado: 0 };
    l.esperado++;
    if (r.chegada_em != null) l.feito++;
    mapa.set(nome, l);
  }
  return [...mapa.entries()]
    .map(([nome, l]) => taxa(nome, l.feito, l.esperado))
    .sort(ordenarPorTaxa);
}

// ---------------------------------------------------------------------------
// 2. Adesão à vistoria semanal
// ---------------------------------------------------------------------------
// A vistoria é semanal, por veículo. O esperado é, então, o número de semanas
// do período — uma por veículo, por semana. Duas vistorias na mesma semana não
// viram 200%: a semana está cumprida, e o excedente não compensa a semana em
// que ninguém olhou o carro.

/** A semana de uma data, no formato "2026-S42". Segunda é o primeiro dia, que
 *  é como a equipe conta — a vistoria de segunda cobre a semana que começa. */
export function semanaDe(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  // ISO 8601: a semana 1 é a que contém a primeira quinta-feira do ano.
  const alvo = new Date(d);
  const diaISO = (d.getUTCDay() + 6) % 7; // segunda = 0
  alvo.setUTCDate(d.getUTCDate() - diaISO + 3); // a quinta daquela semana
  const ano = alvo.getUTCFullYear();
  const primeiraQuinta = new Date(Date.UTC(ano, 0, 4));
  const diaISOjan4 = (primeiraQuinta.getUTCDay() + 6) % 7;
  primeiraQuinta.setUTCDate(primeiraQuinta.getUTCDate() - diaISOjan4 + 3);
  const semana = 1 + Math.round((alvo.getTime() - primeiraQuinta.getTime()) / (7 * 864e5));
  return `${ano}-S${String(semana).padStart(2, "0")}`;
}

/** Quantas semanas distintas o período cobre, contando as pontas. */
export function semanasNoPeriodo(de: string, ate: string): number {
  if (!de || !ate || de > ate) return 0;
  const semanas = new Set<string>();
  for (let t = Date.parse(de + "T00:00:00Z"); t <= Date.parse(ate + "T00:00:00Z"); t += 864e5) {
    semanas.add(semanaDe(new Date(t).toISOString().slice(0, 10)));
  }
  return semanas.size;
}

export type VistoriaRegistro = { veiculo_id: string; data: string };
export type VeiculoRegistro = { id: string; placa: string };

export function adesaoDeVistoria(
  vistorias: VistoriaRegistro[],
  veiculos: VeiculoRegistro[],
  semanas: number,
): Taxa[] {
  const porVeiculo = new Map<string, Set<string>>();
  for (const v of vistorias) {
    const s = porVeiculo.get(v.veiculo_id) ?? new Set<string>();
    s.add(semanaDe(v.data));
    porVeiculo.set(v.veiculo_id, s);
  }
  return veiculos
    .map((v) => {
      // O teto é o número de semanas: a semana cumprida duas vezes conta uma.
      const cumpridas = Math.min(porVeiculo.get(v.id)?.size ?? 0, semanas);
      return taxa(v.placa, cumpridas, semanas);
    })
    .sort(ordenarPorTaxa);
}

// ---------------------------------------------------------------------------
// 3. Veículos com mais avaria
// ---------------------------------------------------------------------------
// Conta a avaria de cada vistoria, e não "quantos veículos têm avaria": o mesmo
// amassado aparece em toda vistoria seguinte até ser consertado, e somar tudo
// contaria o mesmo dano dez vezes. O número honesto é o da ÚLTIMA vistoria de
// cada veículo — o estado atual do carro.

export type VistoriaComItens = { veiculo_id: string; data: string; id: string; itens: unknown };

export type LinhaAvaria = { placa: string; avarias: number; em: string | null };

export function avariasPorVeiculo(
  vistorias: VistoriaComItens[],
  veiculos: VeiculoRegistro[],
): LinhaAvaria[] {
  const ultima = new Map<string, VistoriaComItens>();
  for (const v of vistorias) {
    const atual = ultima.get(v.veiculo_id);
    // Desempate por id: duas vistorias no mesmo dia acontecem quando o técnico
    // refaz depois de corrigir algo, e sem isso "a última" seria sorteada.
    if (!atual || v.data > atual.data || (v.data === atual.data && v.id > atual.id)) {
      ultima.set(v.veiculo_id, v);
    }
  }
  return veiculos
    .map((v) => {
      const u = ultima.get(v.id);
      return { placa: v.placa, avarias: u ? quantasAvarias(u.itens) : 0, em: u?.data ?? null };
    })
    .filter((l) => l.avarias > 0)
    .sort((a, b) => b.avarias - a.avarias || a.placa.localeCompare(b.placa));
}

// ---------------------------------------------------------------------------
// 4. Ordenação comum
// ---------------------------------------------------------------------------
// Pior primeiro. Numa reunião, a linha que importa é a que está embaixo da
// meta — e ela tem que estar no topo do gráfico, não enterrada no fim.
// Quem não tem denominador vai para o fim: não é ruim, é inconclusivo.
function ordenarPorTaxa(a: Taxa, b: Taxa): number {
  if (a.pct == null) return 1;
  if (b.pct == null) return -1;
  return a.pct - b.pct || b.esperado - a.esperado || a.chave.localeCompare(b.chave);
}

/** A taxa somada de todas as linhas — o número da chamada, não a média das
 *  médias. Um técnico com 1 roteiro não pode pesar como um com 40. */
export function taxaGeral(linhas: Taxa[]): Taxa {
  const feito = linhas.reduce((s, l) => s + l.feito, 0);
  const esperado = linhas.reduce((s, l) => s + l.esperado, 0);
  return taxa("geral", feito, esperado);
}
