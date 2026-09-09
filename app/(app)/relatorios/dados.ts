// As contas dos relatórios. Ficam fora do componente de propósito: são a parte
// que precisa estar certa, e num arquivo separado dá para ler cada uma sem
// atravessar JSX.
//
// Onde as contas moram: aqui, sobre as linhas que o banco devolveu, e não em
// coluna gravada. Vale a mesma regra do resto do projeto — o banco guarda o
// fato (km de saída, km de chegada, valor da ordem), o número somado é sempre
// a soma do que existe agora. Na escala do projeto (9 veículos, ~6 roteiros
// por dia) somar no navegador é instantâneo.
//
// O custo do roteiro NÃO é recalculado aqui: vem pronto de `v_roteiros`
// (`custo_roteiro` = km_rodado × custo_km, arredondado pelo banco). Recalcular
// no front criaria uma segunda fonte para o mesmo número, que é exatamente o
// que a planilha fazia.

export type Roteiro = {
  id: string;
  placa: string;
  modelo: string;
  saida_em: string;
  chegada_em: string | null;
  km_rodado: number | null;
  custo_roteiro: number | null;
  custo_km: number | null;
  duracao_min: number | null;
  tecnico_saida: string;
  situacao: string;
};

export type Veiculo = {
  id: string;
  placa: string;
  modelo: string;
  custo_km: number | null;
  consumo_km_l: number | null;
  valor_combustivel: number | null;
};

export type Manutencao = {
  id: string;
  aberta_em: string | null;
  concluida_em: string | null;
  tipo: string | null;
  origem: string | null;
  status: string;
  prioridade: string | null;
  oficina: string | null;
  descricao_problema: string;
  servico_realizado: string | null;
  pecas_trocadas: string | null;
  orcamento: number | null;
  valor_final: number | null;
  placa: string;
  modelo: string;
};

export type Ocorrencia = {
  id: string;
  data: string;
  tipo: string;
  gravidade: string;
  status: string;
  terceiros: boolean;
  local: string | null;
  descricao: string;
  resolvida_em: string | null;
  placa: string;
  modelo: string;
  tecnico: string;
};

// ---------------------------------------------------------------------------
// 1. Combustível por veículo
// ---------------------------------------------------------------------------
export type LinhaCombustivel = {
  placa: string;
  modelo: string;
  roteiros: number;
  km: number;
  custoKm: number | null;
  custo: number;
  litros: number | null; // estimado pelo consumo cadastrado
};

export function combustivelPorVeiculo(
  roteiros: Roteiro[],
  veiculos: Veiculo[],
): LinhaCombustivel[] {
  const porPlaca = new Map<string, LinhaCombustivel>();

  for (const v of veiculos) {
    porPlaca.set(v.placa, {
      placa: v.placa,
      modelo: v.modelo,
      roteiros: 0,
      km: 0,
      custoKm: v.custo_km,
      custo: 0,
      litros: 0,
    });
  }

  for (const r of roteiros) {
    if (r.km_rodado == null) continue; // roteiro ainda na rua não gastou nada ainda
    const l = porPlaca.get(r.placa);
    if (!l) continue;
    l.roteiros++;
    l.km += r.km_rodado;
    l.custo += r.custo_roteiro ?? 0;
  }

  // Litros é ESTIMATIVA: sai do consumo cadastrado, não de nota de posto. Sem
  // consumo cadastrado fica nulo em vez de zero — zero mentiria dizendo que o
  // veículo não bebeu nada.
  for (const v of veiculos) {
    const l = porPlaca.get(v.placa)!;
    l.litros = v.consumo_km_l && v.consumo_km_l > 0 ? l.km / v.consumo_km_l : null;
  }

  return [...porPlaca.values()]
    .filter((l) => l.roteiros > 0)
    .sort((a, b) => b.custo - a.custo);
}

// ---------------------------------------------------------------------------
// 2. Km rodado — por dia, por mês e por veículo
// ---------------------------------------------------------------------------
export type LinhaPeriodo = { chave: string; km: number; roteiros: number; custo: number };

function agrupar(roteiros: Roteiro[], chaveDe: (r: Roteiro) => string | null): LinhaPeriodo[] {
  const mapa = new Map<string, LinhaPeriodo>();
  for (const r of roteiros) {
    if (r.km_rodado == null) continue;
    const chave = chaveDe(r);
    if (!chave) continue;
    const l = mapa.get(chave) ?? { chave, km: 0, roteiros: 0, custo: 0 };
    l.km += r.km_rodado;
    l.roteiros++;
    l.custo += r.custo_roteiro ?? 0;
    mapa.set(chave, l);
  }
  return [...mapa.values()];
}

// `dia` chega pronto de quem chamou (dia local de São Paulo, calculado em
// lib/frota/tempo.ts). Nenhum recorte de string de data acontece aqui.
export function kmPorDia(roteiros: Roteiro[], diaDe: (r: Roteiro) => string | null) {
  return agrupar(roteiros, diaDe).sort((a, b) => b.chave.localeCompare(a.chave));
}

export function kmPorMes(roteiros: Roteiro[], diaDe: (r: Roteiro) => string | null) {
  return agrupar(roteiros, (r) => diaDe(r)?.slice(0, 7) ?? null)
    .sort((a, b) => b.chave.localeCompare(a.chave));
}

export function kmPorVeiculo(roteiros: Roteiro[]) {
  return agrupar(roteiros, (r) => r.placa).sort((a, b) => b.km - a.km);
}

// ---------------------------------------------------------------------------
// 3. Técnicos — deslocamentos
// ---------------------------------------------------------------------------
export type LinhaTecnico = {
  tecnico: string;
  roteiros: number;
  km: number;
  minutos: number;
  dias: number;      // em quantos dias diferentes saiu
  emAberto: number;  // roteiros sem chegada registrada
};

export function porTecnico(roteiros: Roteiro[], diaDe: (r: Roteiro) => string | null): LinhaTecnico[] {
  const mapa = new Map<string, LinhaTecnico & { _dias: Set<string> }>();

  for (const r of roteiros) {
    const nome = r.tecnico_saida || "—";
    const l = mapa.get(nome) ?? {
      tecnico: nome, roteiros: 0, km: 0, minutos: 0, dias: 0, emAberto: 0,
      _dias: new Set<string>(),
    };
    // Conta o deslocamento mesmo sem chegada: a saída aconteceu. Só o km e o
    // tempo esperam o fechamento — somar zero ali faria a média despencar.
    l.roteiros++;
    if (r.chegada_em == null) l.emAberto++;
    l.km += r.km_rodado ?? 0;
    l.minutos += r.duracao_min ?? 0;
    const d = diaDe(r);
    if (d) l._dias.add(d);
    mapa.set(nome, l);
  }

  return [...mapa.values()]
    .map(({ _dias, ...l }) => ({ ...l, dias: _dias.size }))
    .sort((a, b) => b.roteiros - a.roteiros || b.km - a.km);
}

// ---------------------------------------------------------------------------
// 4. Manutenções
// ---------------------------------------------------------------------------
export type ContaManutencao = { gasto: number; previsto: number; abertas: number; ordens: number };

// Mesma separação da aba Manutenções do painel: gasto é dinheiro que saiu,
// previsto é orçamento de ordem ainda aberta. Somar os dois contaria o mesmo
// dinheiro duas vezes ao longo da vida da ordem.
export function contasManutencao(ordens: Manutencao[]): ContaManutencao {
  let gasto = 0, previsto = 0, abertas = 0;
  for (const m of ordens) {
    const cancelada = m.status === "CANCELADA";
    const emAberto = m.status === "ABERTA" || m.status === "EM EXECUÇÃO";
    if (emAberto) abertas++;
    if (cancelada) continue;
    if (m.valor_final != null) gasto += m.valor_final;
    else if (emAberto) previsto += m.orcamento ?? 0;
  }
  return { gasto, previsto, abertas, ordens: ordens.length };
}

export type LinhaManutencao = ContaManutencao & { placa: string; modelo: string };

export function manutencaoPorVeiculo(ordens: Manutencao[]): LinhaManutencao[] {
  const mapa = new Map<string, Manutencao[]>();
  for (const m of ordens) {
    const lista = mapa.get(m.placa) ?? [];
    lista.push(m);
    mapa.set(m.placa, lista);
  }
  return [...mapa.entries()]
    .map(([placa, lista]) => ({
      placa,
      modelo: lista[0].modelo,
      ...contasManutencao(lista),
    }))
    .sort((a, b) => b.gasto - a.gasto || b.previsto - a.previsto);
}

// ---------------------------------------------------------------------------
// 5. Contagem simples por campo — serve ocorrências e manutenções
// ---------------------------------------------------------------------------
export function contar<T>(itens: T[], campo: (x: T) => string | null): { chave: string; n: number }[] {
  const mapa = new Map<string, number>();
  for (const x of itens) {
    const k = campo(x) ?? "—";
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return [...mapa.entries()]
    .map(([chave, n]) => ({ chave, n }))
    .sort((a, b) => b.n - a.n);
}
