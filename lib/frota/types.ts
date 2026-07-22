// Formato de dados que o painel (components/painel/PainelFrota.jsx) espera.
// Espelha a antiga constante DADOS embutida. As views do Supabase sao mapeadas
// para este formato em lib/frota/data.ts.

export interface VeiculoDados {
  id: number | string;
  placa: string;
  modelo: string;
  ano: string | null;
  resp: string;
  km: number | null;
  revisao: number | null;
  status: string;
  kml: number | null;
  precoComb: number | null;
  custoKm: number | null;
  [k: string]: unknown;
}

export interface RoteiroDados {
  placa: string;
  veic: string;
  ds: string | null; // data saida  YYYY-MM-DD
  hs: string | null; // hora saida   HH:MM
  dc: string | null; // data chegada YYYY-MM-DD
  hc: string | null; // hora chegada HH:MM
  tec: string;
  kms: number | null;
  kmc: number | null;
  kmr: number | null;
  st: string; // situacao no vocabulario do painel
  pend: string | number | null;
  [k: string]: unknown;
}

export interface ManutencaoDados {
  id: string | number;
  data: string | null;
  placa: string;
  veic: string;
  km: number | null;
  origem: string | null;
  tipo: string | null;
  prob: string | null;
  prio: string | null;
  oficina: string | null;
  status: string | null;
  conclusao: string | null;
  valor: number | null;
  servico: string | null;
  [k: string]: unknown;
}

export interface CustoDados {
  veic: string;
  placa: string;
  km: number | null;
  total: number | null;
  medio: number | null;
  [k: string]: unknown;
}

export interface ChecklistDados {
  data: string | null;
  cond: string;
  veic: string;
  placa: string;
  km: number | null;
  motivo: string | null;
  desc: string | null;
  urg: string | null;
  [k: string]: unknown;
}

export interface Dados {
  veiculos: VeiculoDados[];
  roteiros: RoteiroDados[];
  manutencoes: ManutencaoDados[];
  custos: CustoDados[];
  checklists: ChecklistDados[];
}
