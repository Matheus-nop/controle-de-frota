"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Consulta do gestor: tudo que a equipe registrou, com as fotos. As tres fontes
// de foto que ja existem viram uma linha do tempo so — checklist (semanais,
// avaria, bloqueio), roteiro (painel/hodometro) e ocorrencia (o dano).

type Veiculo = { id: string; placa: string; modelo: string };

type Foto = { url: string; legenda: string };

type Registro = {
  id: string;
  tipo: "CHECKLIST" | "ROTEIRO" | "OCORRÊNCIA";
  data: string; // YYYY-MM-DD
  placa: string;
  modelo: string;
  tecnico: string;
  resumo: string;
  detalhe: string | null;
  alerta: boolean; // pinta a borda: checklist nao apto, pendencia, ocorrencia grave
  fotos: Foto[];
};

const CORES: Record<string, string> = {
  CHECKLIST: "#2B4C8C",
  ROTEIRO: "#1B9E6B",
  OCORRÊNCIA: "#C0392B",
};

const EMOJI: Record<string, string> = {
  CHECKLIST: "✅",
  ROTEIRO: "🚚",
  OCORRÊNCIA: "⚠️",
};

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}
function dataBR(s: string | null) {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—";
}
function diaISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
// Aceita so o que parece URL: o jsonb e livre e ja passou por versoes diferentes
// do formulario.
function urls(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.startsWith("http"));
}

const input: React.CSSProperties = {
  width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #CBD5E1",
  fontSize: 14, boxSizing: "border-box", background: "#fff",
};
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#53607A", marginBottom: 4, display: "block" };

export default function HistoricoPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [carregando, setCarregando] = useState(true);

  const hoje = diaISO(new Date());
  const trintaDias = diaISO(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const [veiculoId, setVeiculoId] = useState("");
  const [de, setDe] = useState(trintaDias);
  const [ate, setAte] = useState(hoje);
  const [tipo, setTipo] = useState("TODOS");
  const [soComFoto, setSoComFoto] = useState(false);

  // A ficha do veiculo (modal do painel) manda pra ca com ?placa=XXX.
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      await supabase.auth.getUser();
      const { data } = await supabase.from("veiculos").select("id, placa, modelo").order("placa");
      const lista = (data as Veiculo[]) ?? [];
      setVeiculos(lista);

      const placa = new URLSearchParams(window.location.search).get("placa");
      if (placa) {
        const achou = lista.find((v) => v.placa === placa);
        if (achou) setVeiculoId(achou.id);
      }
    })();
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const supabase = createClient();

    let qChk = supabase
      .from("checklists")
      .select("*, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_id(nome)")
      .gte("data", de)
      .lte("data", ate);
    let qRot = supabase
      .from("v_roteiros")
      .select("*")
      .gte("saida_em", de)
      .lte("saida_em", ate + "T23:59:59");
    let qOco = supabase
      .from("ocorrencias")
      .select("*, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_id(nome)")
      .gte("data", de)
      .lte("data", ate);

    if (veiculoId) {
      qChk = qChk.eq("veiculo_id", veiculoId);
      qRot = qRot.eq("veiculo_id", veiculoId);
      qOco = qOco.eq("veiculo_id", veiculoId);
    }

    const [chk, rot, oco] = await Promise.all([qChk, qRot, qOco]);
    const linhas: Registro[] = [];

    /* eslint-disable @typescript-eslint/no-explicit-any */
    for (const c of (chk.data as any[]) ?? []) {
      const v = one(c.veiculo as { placa: string; modelo: string } | null);
      const t = one(c.tecnico as { nome: string } | null);
      const itens = (c.itens ?? {}) as any;
      const fotos: Foto[] = [
        ...urls(itens.fotos_semanais).map((u) => ({ url: u, legenda: "semanal" })),
        ...urls(itens?.avaria?.fotos).map((u) => ({ url: u, legenda: "avaria" })),
        ...urls(itens.fotos_bloqueio).map((u) => ({ url: u, legenda: "bloqueio" })),
      ];
      // foto_url e a primeira das semanais; so entra se nao veio na lista.
      if (typeof c.foto_url === "string" && c.foto_url && !fotos.some((f) => f.url === c.foto_url)) {
        fotos.unshift({ url: c.foto_url, legenda: "semanal" });
      }
      linhas.push({
        id: "chk-" + c.id,
        tipo: "CHECKLIST",
        data: c.data,
        placa: v?.placa ?? "—",
        modelo: v?.modelo ?? "",
        tecnico: t?.nome ?? "—",
        resumo: c.apto ? "Apto para operação" : "NÃO APTO — " + (c.motivo_bloqueio || "sem motivo informado"),
        detalhe: [c.descricao, c.km_atual != null ? `${c.km_atual} km` : null].filter(Boolean).join(" · ") || null,
        alerta: !c.apto,
        fotos,
      });
    }

    for (const r of (rot.data as any[]) ?? []) {
      const fotos: Foto[] = [];
      if (typeof r.foto_painel_saida === "string" && r.foto_painel_saida) {
        fotos.push({ url: r.foto_painel_saida, legenda: "saída" });
      }
      if (typeof r.foto_painel_chegada === "string" && r.foto_painel_chegada) {
        fotos.push({ url: r.foto_painel_chegada, legenda: "chegada" });
      }
      linhas.push({
        id: "rot-" + r.id,
        tipo: "ROTEIRO",
        data: (r.saida_em ?? "").slice(0, 10),
        placa: r.placa ?? "—",
        modelo: r.modelo ?? "",
        tecnico: r.tecnico_saida ?? "—",
        resumo: r.situacao + (r.km_rodado != null ? ` · ${r.km_rodado} km rodados` : ""),
        detalhe: [
          r.km_saida != null ? `saiu com ${r.km_saida} km` : null,
          r.km_chegada != null ? `voltou com ${r.km_chegada} km` : null,
          r.descricao_pendencias,
        ].filter(Boolean).join(" · ") || null,
        alerta: r.situacao === "SEM FECHAMENTO" || !!r.houve_pendencia,
        fotos,
      });
    }

    for (const o of (oco.data as any[]) ?? []) {
      const v = one(o.veiculo as { placa: string; modelo: string } | null);
      const t = one(o.tecnico as { nome: string } | null);
      linhas.push({
        id: "oco-" + o.id,
        tipo: "OCORRÊNCIA",
        data: o.data,
        placa: v?.placa ?? "—",
        modelo: v?.modelo ?? "",
        tecnico: t?.nome ?? "—",
        resumo: `${o.tipo} · ${o.gravidade} · ${o.status}`,
        detalhe: [o.descricao, o.local].filter(Boolean).join(" · ") || null,
        alerta: o.gravidade === "GRAVE",
        fotos: urls(o.fotos).map((u) => ({ url: u, legenda: "dano" })),
      });
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */

    linhas.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    setRegistros(linhas);
    setCarregando(false);
  }, [de, ate, veiculoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const lista = registros
    .filter((r) => (tipo === "TODOS" ? true : r.tipo === tipo))
    .filter((r) => (soComFoto ? r.fotos.length > 0 : true));
  const totalFotos = lista.reduce((s, r) => s + r.fotos.length, 0);

  return (
    <main style={{ minHeight: "100vh", background: "#EBEEF4", padding: 20 }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <a href="/" style={{ fontSize: 13, color: "#2B4C8C", textDecoration: "none" }}>← Voltar ao painel</a>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0 16px", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Histórico e fotos</h1>
          <span style={{ fontSize: 13, color: "#53607A" }}>
            {lista.length} registro{lista.length === 1 ? "" : "s"} · {totalFotos} foto{totalFotos === 1 ? "" : "s"}
          </span>
        </div>

        <div style={{ background: "#fff", border: "1px solid #DBE0EA", borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <div style={{ flex: "2 1 220px", minWidth: 180 }}>
              <label style={lbl}>Veículo</label>
              <select style={input} value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
                <option value="">Todos os veículos</option>
                {veiculos.map((v) => <option key={v.id} value={v.id}>{v.modelo} — {v.placa}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 130px", minWidth: 130 }}>
              <label style={lbl}>De</label>
              <input style={input} type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} />
            </div>
            <div style={{ flex: "1 1 130px", minWidth: 130 }}>
              <label style={lbl}>Até</label>
              <input style={input} type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
            {["TODOS", "CHECKLIST", "ROTEIRO", "OCORRÊNCIA"].map((f) => (
              <button
                key={f}
                onClick={() => setTipo(f)}
                style={{
                  padding: "6px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                  border: tipo === f ? "1px solid #2B4C8C" : "1px solid #DBE0EA",
                  background: tipo === f ? "#2B4C8C" : "#fff",
                  color: tipo === f ? "#fff" : "#53607A",
                }}
              >
                {f === "TODOS" ? "Tudo" : f.charAt(0) + f.slice(1).toLowerCase() + "s"}
              </button>
            ))}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#53607A", marginLeft: "auto" }}>
              <input type="checkbox" checked={soComFoto} onChange={(e) => setSoComFoto(e.target.checked)} />
              Só com foto
            </label>
          </div>
        </div>

        {carregando ? (
          <p style={{ color: "#53607A", fontSize: 14 }}>Carregando…</p>
        ) : lista.length === 0 ? (
          <p style={{ color: "#8591A5", fontSize: 14 }}>
            Nenhum registro nesse filtro. Tente ampliar o período ou tirar o filtro de veículo.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {lista.map((r) => <RegistroCard key={r.id} r={r} />)}
          </div>
        )}
      </div>
    </main>
  );
}

function RegistroCard({ r }: { r: Registro }) {
  const cor = CORES[r.tipo];
  return (
    <div style={{ background: "#fff", border: "1px solid #DBE0EA", borderLeft: `5px solid ${r.alerta ? "#C0392B" : cor}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(22,35,60,.05)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15 }}>{EMOJI[r.tipo]}</span>
        <span style={{ fontWeight: 700, fontSize: 12.5, letterSpacing: ".04em", background: "#F4F6FB", border: "1px solid #C4CCDA", borderRadius: 6, padding: "2px 8px" }}>{r.placa}</span>
        <span style={{ fontSize: 13, color: "#53607A" }}>{r.modelo}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: cor, background: cor + "18", borderRadius: 5, padding: "2px 8px" }}>{r.tipo}</span>
        <span style={{ marginLeft: "auto", fontSize: 12.5, color: "#53607A", fontVariantNumeric: "tabular-nums" }}>{dataBR(r.data)}</span>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, margin: "10px 0 4px", color: r.alerta ? "#A5301F" : "#16233C" }}>{r.resumo}</div>
      <div style={{ fontSize: 12, color: "#53607A" }}>
        {r.tecnico}
        {r.detalhe ? " · " + r.detalhe : ""}
      </div>

      {r.fotos.length > 0 ? (
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {r.fotos.map((f) => (
            <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={f.url}
                alt={`Foto ${f.legenda}`}
                loading="lazy"
                style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 8, border: "1px solid #DBE0EA", display: "block" }}
              />
              <span style={{ display: "block", fontSize: 10.5, color: "#8591A5", textAlign: "center", marginTop: 3 }}>{f.legenda}</span>
            </a>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: "#A9B2C1", marginTop: 8 }}>sem foto</div>
      )}
    </div>
  );
}
