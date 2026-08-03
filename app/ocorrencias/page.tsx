"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

const CORES: Record<string, string> = {
  ABERTA: "#C0392B",
  "EM ANÁLISE": "#C08306",
  RESOLVIDA: "#1B9E6B",
  CANCELADA: "#8591A5",
};

const CORES_GRAVIDADE: Record<string, string> = {
  LEVE: "#1B9E6B",
  MODERADA: "#C08306",
  GRAVE: "#C0392B",
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

const input: React.CSSProperties = {
  width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #CBD5E1",
  fontSize: 14, boxSizing: "border-box", background: "#fff",
};
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#53607A", marginBottom: 4, display: "block" };

export default function OcorrenciasPage() {
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState("ABERTAS");

  async function carregar() {
    const supabase = createClient();
    await supabase.auth.getUser();
    const { data } = await supabase
      .from("ocorrencias")
      .select("*, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_id(nome)")
      .order("data", { ascending: false })
      .order("registrada_em", { ascending: false });
    setOcorrencias((data as Ocorrencia[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const lista = ocorrencias.filter((o) =>
    filtro === "TODAS" ? true : filtro === "ABERTAS" ? o.status === "ABERTA" || o.status === "EM ANÁLISE" : o.status === filtro,
  );
  const abertas = ocorrencias.filter((o) => o.status === "ABERTA" || o.status === "EM ANÁLISE").length;
  const graves = ocorrencias.filter((o) => o.gravidade === "GRAVE" && (o.status === "ABERTA" || o.status === "EM ANÁLISE")).length;

  return (
    <main style={{ minHeight: "100vh", background: "#EBEEF4", padding: 20 }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <a href="/" style={{ fontSize: 13, color: "#2B4C8C", textDecoration: "none" }}>← Voltar ao painel</a>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0 16px", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Ocorrências</h1>
          <span style={{ fontSize: 13, color: "#53607A" }}>
            {abertas} em aberto{graves > 0 ? ` · ${graves} grave${graves > 1 ? "s" : ""}` : ""}
          </span>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {["ABERTAS", "RESOLVIDA", "CANCELADA", "TODAS"].map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              style={{
                padding: "6px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                border: filtro === f ? "1px solid #2B4C8C" : "1px solid #DBE0EA",
                background: filtro === f ? "#2B4C8C" : "#fff",
                color: filtro === f ? "#fff" : "#53607A",
              }}
            >
              {f === "ABERTAS" ? "Em aberto" : f === "TODAS" ? "Todas" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {carregando ? (
          <p style={{ color: "#53607A", fontSize: 14 }}>Carregando…</p>
        ) : lista.length === 0 ? (
          <p style={{ color: "#8591A5", fontSize: 14 }}>Nenhuma ocorrência nesse filtro.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {lista.map((o) => <OcorrenciaCard key={o.id} o={o} onSalvo={carregar} />)}
          </div>
        )}
      </div>
    </main>
  );
}

function OcorrenciaCard({ o, onSalvo }: { o: Ocorrencia; onSalvo: () => void }) {
  const v = one(o.veiculo);
  const t = one(o.tecnico);
  const [aberto, setAberto] = useState(false);
  const [status, setStatus] = useState(o.status);
  const [resolucao, setResolucao] = useState(o.resolucao || "");
  const [bloquear, setBloquear] = useState(o.gravidade === "GRAVE");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);

  const cor = CORES[o.status] || "#8591A5";
  const corGrav = CORES_GRAVIDADE[o.gravidade] || "#8591A5";
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
          resolvida_em: encerrando
            ? (o.resolvida_em ?? new Date().toISOString().slice(0, 10))
            : null,
        })
        .eq("id", o.id);
      if (error) throw error;
      setMsg({ ok: true, txt: "Salvo!" });
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
      setMsg({ ok: true, txt: "Manutenção aberta!" });
      onSalvo();
    } catch (err) {
      setMsg({ ok: false, txt: err instanceof Error ? err.message : "Erro ao abrir a manutenção." });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #DBE0EA", borderLeft: `5px solid ${cor}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(22,35,60,.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 12.5, letterSpacing: ".04em", background: "#F4F6FB", border: "1px solid #C4CCDA", borderRadius: 6, padding: "2px 8px" }}>{v?.placa}</span>
        <span style={{ fontSize: 13, color: "#53607A" }}>{v?.modelo}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: cor, background: cor + "18", borderRadius: 5, padding: "2px 8px" }}>{o.status}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: corGrav, background: corGrav + "18", borderRadius: 5, padding: "2px 8px" }}>{o.gravidade}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#8591A5" }}>{o.tipo}</span>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, margin: "10px 0 4px" }}>{o.descricao}</div>
      <div style={{ fontSize: 12, color: "#53607A" }}>
        {dataBR(o.data)} · relatado por {t?.nome ?? "—"}
        {o.local ? " · " + o.local : ""}
        {o.terceiros ? " · envolveu terceiros" : ""}
        {o.resolvida_em ? " · encerrada " + dataBR(o.resolvida_em) : ""}
      </div>

      {o.resolucao && (
        <div style={{ fontSize: 12.5, color: "#1B7A4B", marginTop: 6 }}>Resolução: {o.resolucao}</div>
      )}

      {fotos.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {fotos.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Foto ${i + 1} da ocorrência`}
                style={{ width: 76, height: 76, objectFit: "cover", borderRadius: 8, border: "1px solid #DBE0EA", display: "block" }}
              />
            </a>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setAberto((x) => !x)} style={{ background: "none", border: "1px solid #DBE0EA", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: "#2B4C8C", cursor: "pointer" }}>
          {aberto ? "Fechar" : "Tratar ocorrência"}
        </button>
        {o.manutencao_id && (
          <a href="/manutencao" style={{ border: "1px solid #DBE0EA", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: "#1B7A4B", textDecoration: "none" }}>
            🔧 Manutenção aberta — ver
          </a>
        )}
      </div>

      {aberto && (
        <div style={{ marginTop: 14, borderTop: "1px solid #EBEEF4", paddingTop: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <div style={{ flex: "1 1 160px", minWidth: 140 }}>
              <label style={lbl}>Status</label>
              <select style={input} value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: "2 1 260px", minWidth: 180 }}>
              <label style={lbl}>Resolução / providência</label>
              <input style={input} value={resolucao} onChange={(e) => setResolucao(e.target.value)} placeholder="o que foi feito" />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
            <button onClick={salvar} disabled={salvando} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: salvando ? "#7CA0C9" : "#2B4C8C", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: salvando ? "default" : "pointer" }}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg.ok ? "#1B7A4B" : "#C0392B" }}>{msg.txt}</span>}
          </div>

          {!o.manutencao_id && (
            <div style={{ marginTop: 16, borderTop: "1px dashed #DBE0EA", paddingTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#16233C", marginBottom: 8 }}>
                Precisa de conserto?
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#53607A", marginBottom: 10 }}>
                <input type="checkbox" checked={bloquear} onChange={(e) => setBloquear(e.target.checked)} />
                Colocar o veículo em manutenção (sai da operação)
              </label>
              <button onClick={virarManutencao} disabled={salvando} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: salvando ? "#7CA0C9" : "#1B9E6B", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: salvando ? "default" : "pointer" }}>
                {salvando ? "Abrindo…" : "Abrir manutenção desta ocorrência"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
