/* eslint-disable @typescript-eslint/no-explicit-any */
// Carrega os dados do painel a partir do Supabase e os mapeia para o formato
// que components/painel/PainelFrota.jsx espera (o antigo shape da constante DADOS).
//
// Fonte de verdade: as views v_roteiros e v_custo_veiculo (numeros derivados
// prontos, sem recalculo no front) mais as tabelas veiculos, manutencoes e
// checklists (a RLS da Fase 2 filtra pelo usuario logado).
//
// Enquanto o banco esta vazio (a migracao/seed dos dados e a proxima fatia da
// Fase 3), caimos no SEED_DADOS para o painel renderizar contra dados reais.

import { createClient } from "@/lib/supabase/server";
import { SEED_DADOS } from "./seed";
import type {
  Dados,
  VeiculoDados,
  RoteiroDados,
  CustoDados,
  ManutencaoDados,
  ChecklistDados,
} from "./types";

export type FonteDados = "supabase" | "seed";

export interface ResultadoDados {
  dados: Dados;
  fonte: FonteDados;
  referencia: string; // substitui a antiga constante REF; e o "hoje" do painel
}

// ---------- helpers ----------

// Relacionamento to-one embutido pode vir como objeto ou array de um item.
function one(rel: any): any {
  return Array.isArray(rel) ? rel[0] : rel;
}

function datePart(ts?: string | null): string | null {
  return ts ? ts.slice(0, 10) : null;
}

function timePart(ts?: string | null): string | null {
  if (!ts) return null;
  const t = ts.includes("T") ? ts.split("T")[1] : ts.slice(11);
  return t ? t.slice(0, 5) : null;
}

function veicLabel(modelo?: string | null, placa?: string | null): string {
  return [modelo, placa].filter(Boolean).join(" - ");
}

// Traduz a coluna `situacao` da view v_roteiros para o vocabulario que o painel
// usa hoje. Os estados "CHEGADA SEM SAIDA" e "KM ALTO VERIFICAR" nascem da
// quarentena (roteiros_quarentena) e serao ligados na fatia de dados da Fase 3.
function mapSituacao(situacao?: string | null): string {
  switch (situacao) {
    case "NA RUA":
    case "SEM FECHAMENTO":
      return "PENDENTE DE CHEGADA";
    case "CONCLUÍDO - DIA SEGUINTE":
    case "CONCLUÍDO":
      return situacao;
    default:
      return situacao ?? "CONCLUÍDO";
  }
}

// ---------- mapeadores view/tabela -> shape do painel ----------

function mapVeiculo(row: any): VeiculoDados {
  const resp = one(row.responsavel);
  return {
    id: row.id,
    placa: row.placa,
    modelo: row.modelo,
    ano: row.ano ?? null,
    resp: resp?.nome ?? "—",
    km: row.km_atual ?? null,
    revisao: row.proxima_revisao_km ?? null,
    status: row.status,
    kml: row.consumo_km_l ?? null,
    precoComb: row.valor_combustivel ?? null,
    custoKm: row.custo_km ?? null,
  };
}

function mapRoteiro(row: any): RoteiroDados {
  return {
    placa: row.placa,
    veic: veicLabel(row.modelo, row.placa),
    ds: datePart(row.saida_em),
    hs: timePart(row.saida_em),
    dc: datePart(row.chegada_em),
    hc: timePart(row.chegada_em),
    tec: row.tecnico_saida ?? "—",
    kms: row.km_saida ?? null,
    kmc: row.km_chegada ?? null,
    kmr: row.km_rodado ?? null,
    st: mapSituacao(row.situacao),
    pend: row.descricao_pendencias ?? null,
  };
}

function mapCusto(row: any): CustoDados {
  return {
    veic: veicLabel(row.modelo, row.placa),
    placa: row.placa,
    km: row.km_total ?? null,
    total: row.custo_total ?? null,
    medio: row.custo_medio_km ?? null,
  };
}

function mapManutencao(row: any): ManutencaoDados {
  const v = one(row.veiculo);
  return {
    id: row.id,
    data: row.aberta_em ?? null,
    placa: v?.placa ?? "—",
    veic: veicLabel(v?.modelo, v?.placa),
    km: row.km_abertura ?? null,
    origem: row.origem ?? null,
    tipo: row.tipo ?? null,
    prob: row.descricao_problema ?? null,
    prio: row.prioridade ?? null,
    oficina: row.oficina ?? null,
    status: row.status ?? null,
    conclusao: row.concluida_em ?? null,
    valor: row.valor_final ?? null,
    servico: row.servico_realizado ?? null,
  };
}

function mapChecklist(row: any): ChecklistDados {
  const v = one(row.veiculo);
  const t = one(row.tecnico);
  return {
    data: row.data ?? null,
    cond: t?.nome ?? "—",
    veic: veicLabel(v?.modelo, v?.placa),
    placa: v?.placa ?? "—",
    km: row.km_atual ?? null,
    motivo: row.motivo_bloqueio ?? null,
    desc: row.descricao ?? null,
    urg: row.urgencia ?? null,
  };
}

// ---------- carregador ----------

export async function carregarDados(): Promise<ResultadoDados> {
  // referencia nativa do seed, para o painel de demonstracao renderizar fiel.
  const referenciaSeed = "2026-07-17";
  const hoje = new Date().toISOString().slice(0, 10);

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Sem sessao a RLS zera tudo; usa o seed para nao mostrar painel vazio.
    if (!user) {
      return { dados: SEED_DADOS, fonte: "seed", referencia: referenciaSeed };
    }

    const [veic, rot, cst, man, chk] = await Promise.all([
      supabase.from("veiculos").select("*, responsavel:responsavel_id(nome)"),
      supabase.from("v_roteiros").select("*"),
      supabase.from("v_custo_veiculo").select("*"),
      supabase.from("manutencoes").select("*, veiculo:veiculo_id(placa,modelo)"),
      supabase
        .from("checklists")
        .select("*, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_id(nome)"),
    ]);

    const veiculos = (veic.data ?? []).map(mapVeiculo);

    // Banco ainda vazio (migracao dos dados e a proxima fatia): usa o seed.
    if (veiculos.length === 0) {
      return { dados: SEED_DADOS, fonte: "seed", referencia: referenciaSeed };
    }

    return {
      dados: {
        veiculos,
        roteiros: (rot.data ?? []).map(mapRoteiro),
        custos: (cst.data ?? []).map(mapCusto),
        manutencoes: (man.data ?? []).map(mapManutencao),
        checklists: (chk.data ?? []).map(mapChecklist),
      },
      fonte: "supabase",
      referencia: hoje,
    };
  } catch {
    // Sem env do Supabase ou erro de rede: seed mantem o painel utilizavel.
    return { dados: SEED_DADOS, fonte: "seed", referencia: referenciaSeed };
  }
}
