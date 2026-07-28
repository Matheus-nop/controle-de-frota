"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Veiculo = {
  id: string;
  placa: string;
  modelo: string;
  ano: string | null;
  responsavel_id: string | null;
  km_atual: number | null;
  proxima_revisao_km: number | null;
  consumo_km_l: number | null;
  valor_combustivel: number | null;
  status: string;
};
type Tecnico = { id: string; nome: string };

const STATUS = ["ATIVO", "MANUTENCAO", "BLOQUEADO", "VENDIDO"];

function intOrNull(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}
function numOrNull(s: string): number | null {
  const n = parseFloat((s || "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}
function normPlaca(p: string): string {
  return p.toUpperCase().replace(/[\s-]/g, "");
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid #CBD5E1",
  fontSize: 14,
  boxSizing: "border-box",
  background: "#fff",
};
const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#53607A", marginBottom: 4, display: "block" };

export default function VeiculosPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  async function carregar() {
    const supabase = createClient();
    await supabase.auth.getUser();
    const [v, t] = await Promise.all([
      supabase
        .from("veiculos")
        .select("id, placa, modelo, ano, responsavel_id, km_atual, proxima_revisao_km, consumo_km_l, valor_combustivel, status")
        .order("placa"),
      supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
    ]);
    setVeiculos((v.data as Veiculo[]) ?? []);
    setTecnicos((t.data as Tecnico[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <main style={{ minHeight: "100vh", background: "#EBEEF4", padding: 20 }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <a href="/" style={{ fontSize: 13, color: "#2B4C8C", textDecoration: "none" }}>← Voltar ao painel</a>
        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0 18px", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Gestão de veículos</h1>
          <button
            onClick={() => setAddOpen((x) => !x)}
            style={{ marginLeft: "auto", padding: "9px 14px", borderRadius: 8, border: "none", background: "#2B4C8C", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
          >
            {addOpen ? "Fechar" : "+ Adicionar veículo"}
          </button>
        </div>

        {addOpen && <AddVeiculo tecnicos={tecnicos} onAdded={() => { setAddOpen(false); setCarregando(true); carregar(); }} />}

        {carregando ? (
          <p style={{ color: "#53607A", fontSize: 14 }}>Carregando…</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {veiculos.map((v) => (
              <VeiculoRow key={v.id} v={v} tecnicos={tecnicos} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Campo({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: "1 1 140px", minWidth: 120 }}>{children}</div>;
}

function VeiculoRow({ v, tecnicos }: { v: Veiculo; tecnicos: Tecnico[] }) {
  const [modelo, setModelo] = useState(v.modelo || "");
  const [ano, setAno] = useState(v.ano || "");
  const [resp, setResp] = useState(v.responsavel_id || "");
  const [km, setKm] = useState(v.km_atual != null ? String(v.km_atual) : "");
  const [rev, setRev] = useState(v.proxima_revisao_km != null ? String(v.proxima_revisao_km) : "");
  const [cons, setCons] = useState(v.consumo_km_l != null ? String(v.consumo_km_l) : "");
  const [comb, setComb] = useState(v.valor_combustivel != null ? String(v.valor_combustivel) : "");
  const [status, setStatus] = useState(v.status);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("veiculos")
      .update({
        modelo: modelo.trim(),
        ano: ano.trim() || null,
        responsavel_id: resp || null,
        km_atual: intOrNull(km),
        proxima_revisao_km: intOrNull(rev),
        consumo_km_l: numOrNull(cons),
        valor_combustivel: numOrNull(comb),
        status,
      })
      .eq("id", v.id);
    setMsg(error ? { ok: false, txt: error.message } : { ok: true, txt: "Salvo!" });
    setSalvando(false);
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #DBE0EA", borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(22,35,60,.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: ".04em", background: "#F4F6FB", border: "1px solid #C4CCDA", borderRadius: 6, padding: "3px 8px" }}>{v.placa}</span>
        <span style={{ fontSize: 13, color: "#53607A" }}>{v.modelo}</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Campo><label style={label}>Modelo</label><input style={inputStyle} value={modelo} onChange={(e) => setModelo(e.target.value)} /></Campo>
        <Campo><label style={label}>Ano</label><input style={inputStyle} value={ano} onChange={(e) => setAno(e.target.value)} placeholder="2024/2025" /></Campo>
        <Campo>
          <label style={label}>Responsável</label>
          <select style={inputStyle} value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">—</option>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Campo>
        <Campo><label style={label}>Km atual</label><input style={inputStyle} type="number" inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value)} /></Campo>
        <Campo><label style={label}>Próx. revisão (km)</label><input style={inputStyle} type="number" inputMode="numeric" value={rev} onChange={(e) => setRev(e.target.value)} /></Campo>
        <Campo><label style={label}>Consumo (km/l)</label><input style={inputStyle} type="number" step="0.1" inputMode="decimal" value={cons} onChange={(e) => setCons(e.target.value)} /></Campo>
        <Campo><label style={label}>Preço combustível</label><input style={inputStyle} type="number" step="0.01" inputMode="decimal" value={comb} onChange={(e) => setComb(e.target.value)} /></Campo>
        <Campo>
          <label style={label}>Status</label>
          <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Campo>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <button onClick={salvar} disabled={salvando} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: salvando ? "#7CA0C9" : "#2B4C8C", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: salvando ? "default" : "pointer" }}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.ok ? "#1B7A4B" : "#C0392B" }}>{msg.txt}</span>}
      </div>
    </div>
  );
}

function AddVeiculo({ tecnicos, onAdded }: { tecnicos: Tecnico[]; onAdded: () => void }) {
  const [placa, setPlaca] = useState("");
  const [modelo, setModelo] = useState("");
  const [ano, setAno] = useState("");
  const [resp, setResp] = useState("");
  const [km, setKm] = useState("");
  const [rev, setRev] = useState("");
  const [cons, setCons] = useState("");
  const [comb, setComb] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!placa.trim() || !modelo.trim()) {
      setErro("Placa e modelo são obrigatórios.");
      return;
    }
    setSalvando(true);
    const supabase = createClient();
    const { error } = await supabase.from("veiculos").insert({
      placa: normPlaca(placa),
      modelo: modelo.trim(),
      ano: ano.trim() || null,
      responsavel_id: resp || null,
      km_atual: intOrNull(km),
      proxima_revisao_km: intOrNull(rev),
      consumo_km_l: numOrNull(cons),
      valor_combustivel: numOrNull(comb),
      status: "ATIVO",
    });
    if (error) {
      setErro(error.code === "23505" ? "Já existe um veículo com essa placa." : error.message);
      setSalvando(false);
    } else {
      onAdded();
    }
  }

  return (
    <form onSubmit={criar} style={{ background: "#fff", border: "1px solid #2B4C8C", borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Novo veículo</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Campo><label style={label}>Placa *</label><input style={inputStyle} value={placa} onChange={(e) => setPlaca(e.target.value)} placeholder="SRT9D55" /></Campo>
        <Campo><label style={label}>Modelo *</label><input style={inputStyle} value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Fiorino" /></Campo>
        <Campo><label style={label}>Ano</label><input style={inputStyle} value={ano} onChange={(e) => setAno(e.target.value)} placeholder="2024/2025" /></Campo>
        <Campo>
          <label style={label}>Responsável</label>
          <select style={inputStyle} value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">—</option>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Campo>
        <Campo><label style={label}>Km atual</label><input style={inputStyle} type="number" value={km} onChange={(e) => setKm(e.target.value)} /></Campo>
        <Campo><label style={label}>Próx. revisão (km)</label><input style={inputStyle} type="number" value={rev} onChange={(e) => setRev(e.target.value)} /></Campo>
        <Campo><label style={label}>Consumo (km/l)</label><input style={inputStyle} type="number" step="0.1" value={cons} onChange={(e) => setCons(e.target.value)} /></Campo>
        <Campo><label style={label}>Preço combustível</label><input style={inputStyle} type="number" step="0.01" value={comb} onChange={(e) => setComb(e.target.value)} /></Campo>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <button type="submit" disabled={salvando} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: salvando ? "#7CA0C9" : "#1B9E6B", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: salvando ? "default" : "pointer" }}>
          {salvando ? "Criando…" : "Criar veículo"}
        </button>
        {erro && <span style={{ fontSize: 13, color: "#C0392B" }}>{erro}</span>}
      </div>
    </form>
  );
}
