"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { hojeBR } from "@/lib/frota/tempo";

type Veiculo = { id: string; placa: string; modelo: string };
type Tecnico = { id: string; nome: string };
type Manut = {
  id: string;
  veiculo_id: string;
  aberta_em: string | null;
  km_abertura: number | null;
  origem: string | null;
  tipo: string | null;
  descricao_problema: string;
  prioridade: string | null;
  responsavel_id: string | null;
  oficina: string | null;
  orcamento: number | null;
  status: string;
  concluida_em: string | null;
  valor_final: number | null;
  servico_realizado: string | null;
  pecas_trocadas: string | null;
  proxima_revisao_km: number | null;
  nota_fiscal_url: string | null;
  veiculo: { placa: string; modelo: string } | { placa: string; modelo: string }[] | null;
};

const ORIGENS = ["CHECKLIST SEMANAL", "ROTEIRO", "ACIDENTE/AVARIA", "PREVENTIVA PROGRAMADA", "OUTRO"];
const TIPOS = ["PREVENTIVA", "CORRETIVA"];
const PRIORIDADES = ["BAIXA", "MÉDIA", "ALTA", "EMERGENCIAL"];
const STATUS = ["ABERTA", "EM EXECUÇÃO", "CONCLUÍDA", "CANCELADA"];

const CORES: Record<string, string> = {
  ABERTA: "#C08306",
  "EM EXECUÇÃO": "#2B4C8C",
  CONCLUÍDA: "#1B9E6B",
  CANCELADA: "#8591A5",
};

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}
function intOrNull(s: string): number | null {
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}
function numOrNull(s: string): number | null {
  const n = parseFloat((s || "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}
function brl(n: number | null) {
  return n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dataBR(s: string | null) {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—";
}

const input: React.CSSProperties = {
  width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #CBD5E1",
  fontSize: 14, boxSizing: "border-box", background: "#fff",
};
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#53607A", marginBottom: 4, display: "block" };

function Campo({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: "1 1 160px", minWidth: 140 }}>{children}</div>;
}

export default function ManutencaoPage() {
  const [manuts, setManuts] = useState<Manut[]>([]);
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [filtro, setFiltro] = useState("ABERTAS");

  async function carregar() {
    const supabase = createClient();
    await supabase.auth.getUser();
    const [m, v, t] = await Promise.all([
      supabase
        .from("manutencoes")
        .select("*, veiculo:veiculo_id(placa,modelo)")
        .order("aberta_em", { ascending: false }),
      supabase.from("veiculos").select("id, placa, modelo").in("status", ["ATIVO", "BLOQUEADO", "MANUTENCAO"]).order("placa"),
      supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
    ]);
    setManuts((m.data as Manut[]) ?? []);
    setVeiculos((v.data as Veiculo[]) ?? []);
    setTecnicos((t.data as Tecnico[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const lista = manuts.filter((m) =>
    filtro === "TODAS" ? true : filtro === "ABERTAS" ? m.status === "ABERTA" || m.status === "EM EXECUÇÃO" : m.status === filtro,
  );
  const abertas = manuts.filter((m) => m.status === "ABERTA" || m.status === "EM EXECUÇÃO").length;
  const gastoTotal = manuts.reduce((s, m) => s + (m.valor_final || 0), 0);

  return (
    <main style={{ minHeight: "100vh", background: "#EBEEF4", padding: 20 }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <a href="/" style={{ fontSize: 13, color: "#2B4C8C", textDecoration: "none" }}>← Voltar ao painel</a>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0 16px", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Manutenções</h1>
          <span style={{ fontSize: 13, color: "#53607A" }}>{abertas} em aberto · {brl(gastoTotal)} gastos</span>
          <button
            onClick={() => setAddOpen((x) => !x)}
            style={{ marginLeft: "auto", padding: "9px 14px", borderRadius: 8, border: "none", background: "#2B4C8C", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}
          >
            {addOpen ? "Fechar" : "+ Abrir manutenção"}
          </button>
        </div>

        {addOpen && (
          <NovaManutencao
            veiculos={veiculos}
            tecnicos={tecnicos}
            onCriada={() => { setAddOpen(false); setCarregando(true); carregar(); }}
          />
        )}

        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          {["ABERTAS", "CONCLUÍDA", "CANCELADA", "TODAS"].map((f) => (
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
          <p style={{ color: "#8591A5", fontSize: 14 }}>Nenhuma manutenção nesse filtro.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {lista.map((m) => (
              <ManutCard key={m.id} m={m} tecnicos={tecnicos} onSalvo={carregar} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function ManutCard({ m, tecnicos, onSalvo }: { m: Manut; tecnicos: Tecnico[]; onSalvo: () => void }) {
  const v = one(m.veiculo);
  const [aberto, setAberto] = useState(false);
  const [status, setStatus] = useState(m.status);
  const [oficina, setOficina] = useState(m.oficina || "");
  const [orcamento, setOrcamento] = useState(m.orcamento != null ? String(m.orcamento) : "");
  const [valor, setValor] = useState(m.valor_final != null ? String(m.valor_final) : "");
  const [servico, setServico] = useState(m.servico_realizado || "");
  const [pecas, setPecas] = useState(m.pecas_trocadas || "");
  const [proxRev, setProxRev] = useState(m.proxima_revisao_km != null ? String(m.proxima_revisao_km) : "");
  const [resp, setResp] = useState(m.responsavel_id || "");
  const [nf, setNf] = useState<FileList | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; txt: string } | null>(null);

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    try {
      const supabase = createClient();
      let nfUrl = m.nota_fiscal_url;

      if (nf && nf.length > 0) {
        const f = nf[0];
        const ext = (f.name.split(".").pop() || "pdf").toLowerCase();
        const path = `${m.id}/nf-${Date.now()}.${ext}`;
        const up = await supabase.storage.from("manutencoes").upload(path, f);
        if (up.error) throw up.error;
        nfUrl = supabase.storage.from("manutencoes").getPublicUrl(path).data.publicUrl;
      }

      const concluindo = status === "CONCLUÍDA";
      const { error } = await supabase
        .from("manutencoes")
        .update({
          status,
          oficina: oficina.trim() || null,
          orcamento: numOrNull(orcamento),
          valor_final: numOrNull(valor),
          servico_realizado: servico.trim() || null,
          pecas_trocadas: pecas.trim() || null,
          proxima_revisao_km: intOrNull(proxRev),
          responsavel_id: resp || null,
          concluida_em: concluindo ? (m.concluida_em ?? hojeBR()) : null,
          nota_fiscal_url: nfUrl,
        })
        .eq("id", m.id);
      if (error) throw error;
      setMsg({ ok: true, txt: "Salvo!" });
      onSalvo();
    } catch (err) {
      setMsg({ ok: false, txt: err instanceof Error ? err.message : "Erro ao salvar." });
    } finally {
      setSalvando(false);
    }
  }

  const cor = CORES[m.status] || "#8591A5";

  return (
    <div style={{ background: "#fff", border: "1px solid #DBE0EA", borderLeft: `5px solid ${cor}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(22,35,60,.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 12.5, letterSpacing: ".04em", background: "#F4F6FB", border: "1px solid #C4CCDA", borderRadius: 6, padding: "2px 8px" }}>{v?.placa}</span>
        <span style={{ fontSize: 13, color: "#53607A" }}>{v?.modelo}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: cor, background: cor + "18", borderRadius: 5, padding: "2px 8px" }}>{m.status}</span>
        {m.prioridade && <span style={{ fontSize: 11.5, color: "#53607A" }}>{m.prioridade}</span>}
        <span style={{ marginLeft: "auto", fontWeight: 650, fontSize: 14 }}>{brl(m.valor_final ?? m.orcamento)}</span>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, margin: "10px 0 4px" }}>{m.descricao_problema}</div>
      <div style={{ fontSize: 12, color: "#53607A" }}>
        Aberta {dataBR(m.aberta_em)}{m.origem ? " · " + m.origem : ""}{m.oficina ? " · " + m.oficina : ""}
        {m.concluida_em ? " · concluída " + dataBR(m.concluida_em) : ""}
      </div>

      {m.nota_fiscal_url && (
        <a href={m.nota_fiscal_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: "#2B4C8C", display: "inline-block", marginTop: 8 }}>
          📎 Ver nota fiscal
        </a>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => setAberto((x) => !x)} style={{ background: "none", border: "1px solid #DBE0EA", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: "#2B4C8C", cursor: "pointer" }}>
          {aberto ? "Fechar" : "Registrar andamento"}
        </button>
        {/* o papel que vai com o veículo para a oficina */}
        <a href={`/manutencao/ordem?id=${m.id}`} style={{ display: "inline-block", border: "1px solid #DBE0EA", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: "#53607A", textDecoration: "none" }}>
          🖨 Ordem de serviço
        </a>
      </div>

      {aberto && (
        <div style={{ marginTop: 14, borderTop: "1px solid #EBEEF4", paddingTop: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Campo>
              <label style={lbl}>Status</label>
              <select style={input} value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Campo>
            <Campo><label style={lbl}>Oficina</label><input style={input} value={oficina} onChange={(e) => setOficina(e.target.value)} /></Campo>
            <Campo>
              <label style={lbl}>Responsável</label>
              <select style={input} value={resp} onChange={(e) => setResp(e.target.value)}>
                <option value="">—</option>
                {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </Campo>
            <Campo><label style={lbl}>Orçamento</label><input style={input} type="number" step="0.01" value={orcamento} onChange={(e) => setOrcamento(e.target.value)} /></Campo>
            <Campo><label style={lbl}>Valor final</label><input style={input} type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} /></Campo>
            <Campo><label style={lbl}>Próx. revisão (km)</label><input style={input} type="number" value={proxRev} onChange={(e) => setProxRev(e.target.value)} /></Campo>
          </div>

          <div style={{ marginTop: 10 }}>
            <label style={lbl}>Serviço realizado</label>
            <input style={input} value={servico} onChange={(e) => setServico(e.target.value)} placeholder="o que foi feito" />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={lbl}>Peças trocadas</label>
            <input style={input} value={pecas} onChange={(e) => setPecas(e.target.value)} placeholder="peças substituídas" />
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={lbl}>Nota fiscal (foto ou PDF)</label>
            <input style={{ ...input, padding: 8 }} type="file" accept="image/*,application/pdf" onChange={(e) => setNf(e.target.files)} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
            <button onClick={salvar} disabled={salvando} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: salvando ? "#7CA0C9" : "#2B4C8C", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: salvando ? "default" : "pointer" }}>
              {salvando ? "Salvando…" : "Salvar andamento"}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg.ok ? "#1B7A4B" : "#C0392B" }}>{msg.txt}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function NovaManutencao({ veiculos, tecnicos, onCriada }: { veiculos: Veiculo[]; tecnicos: Tecnico[]; onCriada: () => void }) {
  const [veiculoId, setVeiculoId] = useState("");
  const [km, setKm] = useState("");
  const [origem, setOrigem] = useState("");
  const [tipo, setTipo] = useState("");
  const [problema, setProblema] = useState("");
  const [prioridade, setPrioridade] = useState("");
  const [resp, setResp] = useState("");
  const [oficina, setOficina] = useState("");
  const [orcamento, setOrcamento] = useState("");
  const [bloquear, setBloquear] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // id da ordem recem-aberta: e so para oferecer a impressao na hora, que e
  // quando o veiculo ainda esta na mao de quem vai levar para a oficina.
  const [criadaId, setCriadaId] = useState<string | null>(null);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!veiculoId || !problema.trim()) {
      setErro("Escolha o veículo e descreva o problema.");
      return;
    }
    setSalvando(true);
    const supabase = createClient();
    const { data: criada, error } = await supabase.from("manutencoes").insert({
      veiculo_id: veiculoId,
      km_abertura: intOrNull(km),
      origem: origem || null,
      tipo: tipo || null,
      descricao_problema: problema.trim(),
      prioridade: prioridade || null,
      responsavel_id: resp || null,
      oficina: oficina.trim() || null,
      orcamento: numOrNull(orcamento),
      status: "ABERTA",
    }).select("id").single();
    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }
    if (bloquear) {
      await supabase.from("veiculos").update({ status: "MANUTENCAO" }).eq("id", veiculoId);
    }
    setCriadaId((criada as { id: string } | null)?.id ?? null);
    onCriada();
  }

  return (
    <form onSubmit={criar} style={{ background: "#fff", border: "1px solid #2B4C8C", borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Abrir manutenção</h3>

      {criadaId && (
        <div style={{ background: "#E5F4EE", border: "1px solid #B6DECB", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#146848" }}>Manutenção aberta.</div>
          <p style={{ fontSize: 12.5, color: "#146848", margin: "5px 0 9px", lineHeight: 1.45 }}>
            Imprima a ordem de serviço e mande junto com o veículo — é o que orienta a oficina
            e volta preenchido para você lançar aqui.
          </p>
          <a
            href={`/manutencao/ordem?id=${criadaId}`}
            style={{ display: "inline-block", background: "#fff", border: "1px solid #B6DECB", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: "#146848", textDecoration: "none" }}
          >
            🖨 Imprimir ordem de serviço
          </a>
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Campo>
          <label style={lbl}>Veículo *</label>
          <select style={input} value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
            <option value="">Selecione…</option>
            {veiculos.map((v) => <option key={v.id} value={v.id}>{v.modelo} — {v.placa}</option>)}
          </select>
        </Campo>
        <Campo><label style={lbl}>Km na abertura</label><input style={input} type="number" value={km} onChange={(e) => setKm(e.target.value)} /></Campo>
        <Campo>
          <label style={lbl}>Origem</label>
          <select style={input} value={origem} onChange={(e) => setOrigem(e.target.value)}>
            <option value="">—</option>
            {ORIGENS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Campo>
        <Campo>
          <label style={lbl}>Tipo</label>
          <select style={input} value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">—</option>
            {TIPOS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Campo>
        <Campo>
          <label style={lbl}>Prioridade</label>
          <select style={input} value={prioridade} onChange={(e) => setPrioridade(e.target.value)}>
            <option value="">—</option>
            {PRIORIDADES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Campo>
        <Campo>
          <label style={lbl}>Responsável</label>
          <select style={input} value={resp} onChange={(e) => setResp(e.target.value)}>
            <option value="">—</option>
            {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Campo>
        <Campo><label style={lbl}>Oficina</label><input style={input} value={oficina} onChange={(e) => setOficina(e.target.value)} /></Campo>
        <Campo><label style={lbl}>Orçamento</label><input style={input} type="number" step="0.01" value={orcamento} onChange={(e) => setOrcamento(e.target.value)} /></Campo>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={lbl}>Problema *</label>
        <input style={input} value={problema} onChange={(e) => setProblema(e.target.value)} placeholder="descreva o problema" />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, fontWeight: 600, color: "#16233C" }}>
        <input type="checkbox" checked={bloquear} onChange={(e) => setBloquear(e.target.checked)} />
        Colocar o veículo em manutenção (sai da operação)
      </label>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
        <button type="submit" disabled={salvando} style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: salvando ? "#7CA0C9" : "#1B9E6B", color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: salvando ? "default" : "pointer" }}>
          {salvando ? "Abrindo…" : "Abrir manutenção"}
        </button>
        {erro && <span style={{ fontSize: 13, color: "#C0392B" }}>{erro}</span>}
      </div>
    </form>
  );
}
