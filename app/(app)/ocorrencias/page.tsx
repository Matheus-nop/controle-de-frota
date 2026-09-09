"use client";

import { useCallback, useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hojeBR } from "@/lib/frota/tempo";
import {
  Badge,
  Botao,
  BotaoLink,
  Campo,
  Cartao,
  Carregando,
  Checkbox,
  Input,
  Pagina,
  Placa,
  Select,
  Vazio,
  cx,
  type Tom,
} from "@/components/ui";

type Ocorrencia = {
  id: string;
  veiculo_id: string;
  tipo: string;
  data: string;
  registrada_em: string;
  local: string | null;
  descricao: string;
  gravidade: string;
  terceiros: boolean;
  fotos: string[] | null;
  status: string;
  resolvida_em: string | null;
  resolucao: string | null;
  manutencao_id: string | null;
  veiculo: { placa: string; modelo: string } | { placa: string; modelo: string }[] | null;
  tecnico: { nome: string } | { nome: string }[] | null;
};

const STATUS = ["ABERTA", "EM ANÁLISE", "RESOLVIDA", "CANCELADA"];

const TOM_STATUS: Record<string, Tom> = {
  ABERTA: "critico",
  "EM ANÁLISE": "atencao",
  RESOLVIDA: "ok",
  CANCELADA: "mudo",
};
const FAIXA_STATUS: Record<string, string> = {
  ABERTA: "border-l-red-600",
  "EM ANÁLISE": "border-l-amber-500",
  RESOLVIDA: "border-l-emerald-600",
  CANCELADA: "border-l-slate-300",
};
const TOM_GRAVIDADE: Record<string, Tom> = {
  LEVE: "ok",
  MODERADA: "atencao",
  GRAVE: "critico",
};

// Gravidade da ocorrencia vira prioridade da manutencao.
const PRIORIDADE_POR_GRAVIDADE: Record<string, string> = {
  LEVE: "BAIXA",
  MODERADA: "MÉDIA",
  GRAVE: "ALTA",
};

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}
function dataBR(s: string | null) {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—";
}

const FILTROS: [string, string][] = [
  ["ABERTAS", "Em aberto"],
  ["RESOLVIDA", "Resolvidas"],
  ["CANCELADA", "Canceladas"],
  ["TODAS", "Todas"],
];

export default function OcorrenciasPage() {
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState("ABERTAS");

  const carregar = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.getUser();
    const { data } = await supabase
      .from("ocorrencias")
      .select("*, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_id(nome)")
      .order("data", { ascending: false })
      .order("registrada_em", { ascending: false });
    setOcorrencias((data as Ocorrencia[]) ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, [carregar]);

  const lista = ocorrencias.filter((o) =>
    filtro === "TODAS"
      ? true
      : filtro === "ABERTAS"
        ? o.status === "ABERTA" || o.status === "EM ANÁLISE"
        : o.status === filtro,
  );
  const abertas = ocorrencias.filter((o) => o.status === "ABERTA" || o.status === "EM ANÁLISE").length;
  const graves = ocorrencias.filter(
    (o) => o.gravidade === "GRAVE" && (o.status === "ABERTA" || o.status === "EM ANÁLISE"),
  ).length;

  return (
    <Pagina
      estreita
      titulo="Ocorrências"
      subtitulo={
        carregando ? "carregando…" : `${abertas} em aberto${graves > 0 ? ` · ${graves} grave(s)` : ""}`
      }
      acoes={
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map(([valor, rotulo]) => (
            <button
              key={valor}
              onClick={() => setFiltro(valor)}
              className={cx(
                "rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset transition",
                filtro === valor
                  ? "bg-brand-700 text-white ring-brand-700"
                  : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      }
    >
      {carregando ? (
        <Cartao>
          <Carregando />
        </Cartao>
      ) : lista.length === 0 ? (
        <Vazio titulo="Nenhuma ocorrência nesse filtro." />
      ) : (
        <div className="flex flex-col gap-3">
          {lista.map((o) => (
            <CartaoOcorrencia key={o.id} o={o} onSalvo={carregar} />
          ))}
        </div>
      )}
    </Pagina>
  );
}

function CartaoOcorrencia({ o, onSalvo }: { o: Ocorrencia; onSalvo: () => void }) {
  const v = one(o.veiculo);
  const t = one(o.tecnico);
  const [aberto, setAberto] = useState(false);
  const [status, setStatus] = useState(o.status);
  const [resolucao, setResolucao] = useState(o.resolucao || "");
  const [bloquear, setBloquear] = useState(o.gravidade === "GRAVE");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);

  const fotos = Array.isArray(o.fotos) ? o.fotos : [];

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    try {
      const supabase = createClient();
      const encerrando = status === "RESOLVIDA" || status === "CANCELADA";
      const { error } = await supabase
        .from("ocorrencias")
        .update({
          status,
          resolucao: resolucao.trim() || null,
          resolvida_em: encerrando ? (o.resolvida_em ?? hojeBR()) : null,
        })
        .eq("id", o.id);
      if (error) throw error;
      setMsg({ ok: true, txt: "Salvo." });
      onSalvo();
    } catch (err) {
      setMsg({ ok: false, txt: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSalvando(false);
    }
  }

  // Converte a ocorrencia em manutencao: abre a OS ja preenchida com o relato do
  // tecnico e guarda o vinculo, para a ocorrencia nao virar dado solto.
  async function virarManutencao() {
    setSalvando(true);
    setMsg(null);
    try {
      const supabase = createClient();
      const { data: nova, error } = await supabase
        .from("manutencoes")
        .insert({
          veiculo_id: o.veiculo_id,
          origem: "ACIDENTE/AVARIA",
          tipo: "CORRETIVA",
          descricao_problema: `[${o.tipo} em ${dataBR(o.data)}] ${o.descricao}`,
          prioridade: PRIORIDADE_POR_GRAVIDADE[o.gravidade] ?? "MÉDIA",
          status: "ABERTA",
        })
        .select("id")
        .single();
      if (error) throw error;

      const { error: erroVinculo } = await supabase
        .from("ocorrencias")
        .update({ manutencao_id: nova.id, status: "EM ANÁLISE" })
        .eq("id", o.id);
      if (erroVinculo) throw erroVinculo;

      if (bloquear) {
        await supabase.from("veiculos").update({ status: "MANUTENCAO" }).eq("id", o.veiculo_id);
      }

      setStatus("EM ANÁLISE");
      setMsg({ ok: true, txt: "Manutenção aberta." });
      onSalvo();
    } catch (err) {
      setMsg({ ok: false, txt: err instanceof Error ? err.message : "Erro ao abrir a manutenção." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Cartao className={cx("border-l-4 p-4", FAIXA_STATUS[o.status] ?? "border-l-slate-300")}>
      <div className="flex flex-wrap items-center gap-2">
        <Placa>{v?.placa}</Placa>
        <span className="text-[13px] text-slate-500">{v?.modelo}</span>
        <Badge tom={TOM_STATUS[o.status] ?? "mudo"}>{o.status}</Badge>
        <Badge tom={TOM_GRAVIDADE[o.gravidade] ?? "mudo"}>{o.gravidade}</Badge>
        <span className="ml-auto text-[12px] text-slate-400">{o.tipo}</span>
      </div>

      <div className="mb-1 mt-2.5 text-sm font-semibold text-slate-900">{o.descricao}</div>
      <div className="text-[12px] text-slate-500">
        {dataBR(o.data)} · relatado por {t?.nome ?? "—"}
        {o.local ? " · " + o.local : ""}
        {o.terceiros ? " · envolveu terceiros" : ""}
        {o.resolvida_em ? " · encerrada " + dataBR(o.resolvida_em) : ""}
      </div>

      {o.resolucao && (
        <div className="mt-1.5 text-[12.5px] text-emerald-700">Resolução: {o.resolucao}</div>
      )}

      {fotos.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {fotos.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Foto ${i + 1} da ocorrência`}
                className="block h-[76px] w-[76px] rounded-lg object-cover ring-1 ring-slate-200 transition hover:ring-brand-400"
              />
            </a>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Botao tamanho="sm" onClick={() => setAberto((x) => !x)}>
          {aberto ? "Fechar" : "Tratar ocorrência"}
        </Botao>
        {o.manutencao_id && (
          <BotaoLink href="/manutencao" tamanho="sm" className="text-emerald-700">
            <Wrench size={13} />
            Manutenção aberta — ver
          </BotaoLink>
        )}
      </div>

      {aberto && (
        <div className="mt-3.5 border-t border-slate-100 pt-3.5">
          <div className="flex flex-wrap gap-2.5">
            <Campo rotulo="Status" className="min-w-[140px] flex-[1_1_160px]">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Resolução / providência" className="min-w-[180px] flex-[2_1_260px]">
              <Input
                value={resolucao}
                onChange={(e) => setResolucao(e.target.value)}
                placeholder="o que foi feito"
              />
            </Campo>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <Botao variante="primario" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Botao>
            {msg && (
              <span className={cx("text-[13px]", msg.ok ? "text-emerald-700" : "text-red-700")}>
                {msg.txt}
              </span>
            )}
          </div>

          {!o.manutencao_id && (
            <div className="mt-4 border-t border-dashed border-slate-200 pt-3.5">
              <div className="mb-2 text-[13px] font-semibold text-slate-900">Precisa de conserto?</div>
              <label className="mb-2.5 flex items-center gap-2 text-[13px] text-slate-600">
                <Checkbox checked={bloquear} onChange={(e) => setBloquear(e.target.checked)} />
                Colocar o veículo em manutenção (sai da operação)
              </label>
              <Botao variante="sucesso" onClick={virarManutencao} disabled={salvando}>
                <Wrench size={14} />
                {salvando ? "Abrindo…" : "Abrir manutenção desta ocorrência"}
              </Botao>
            </div>
          )}
        </div>
      )}
    </Cartao>
  );
}
