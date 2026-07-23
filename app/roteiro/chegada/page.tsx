"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Aberto = {
  id: string;
  km_saida: number;
  saida_em: string;
  tecnico_saida_id: string;
  veiculo: { placa: string; modelo: string } | { placa: string; modelo: string }[] | null;
  tecnico: { nome: string } | { nome: string }[] | null;
};
type Tecnico = { id: string; nome: string };

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export default function RegistrarChegadaPage() {
  const [abertos, setAbertos] = useState<Aberto[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [roteiroId, setRoteiroId] = useState("");
  const [km, setKm] = useState("");
  const [tecnicoChegadaId, setTecnicoChegadaId] = useState("");
  const [obs, setObs] = useState("");
  const [pendencia, setPendencia] = useState(false);
  const [descPend, setDescPend] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function carregar() {
    const supabase = createClient();
    const [r, t] = await Promise.all([
      supabase
        .from("roteiros")
        .select(
          "id, km_saida, saida_em, tecnico_saida_id, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_saida_id(nome)",
        )
        .is("chegada_em", null)
        .order("saida_em"),
      supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
    ]);
    setAbertos((r.data as Aberto[]) ?? []);
    setTecnicos((t.data as Tecnico[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const sel = abertos.find((x) => x.id === roteiroId);

  function selecionar(id: string) {
    setRoteiroId(id);
    setErro(null);
    const r = abertos.find((x) => x.id === id);
    setTecnicoChegadaId(r?.tecnico_saida_id ?? "");
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!sel) {
      setErro("Selecione um roteiro aberto.");
      return;
    }
    const kmNum = parseInt(km, 10);
    if (Number.isNaN(kmNum)) {
      setErro("Informe o km de chegada.");
      return;
    }
    if (kmNum < sel.km_saida) {
      setErro(`Km de chegada (${kmNum}) menor que o de saída (${sel.km_saida}).`);
      return;
    }
    if (kmNum - sel.km_saida > 600) {
      setErro(
        `Diferença de ${kmNum - sel.km_saida} km (acima de 600). Confira o hodômetro — trajetos muito longos precisam de revisão manual.`,
      );
      return;
    }

    setSalvando(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("roteiros")
      .update({
        chegada_em: new Date().toISOString(),
        km_chegada: kmNum,
        tecnico_chegada_id: tecnicoChegadaId || sel.tecnico_saida_id,
        obs_chegada: obs.trim() || null,
        houve_pendencia: pendencia,
        descricao_pendencias: pendencia ? descPend.trim() || null : null,
      })
      .eq("id", sel.id);

    if (error) {
      if (error.code === "23514") {
        setErro("Km fora do padrão (constraint do banco). Precisa de revisão manual.");
      } else {
        setErro(error.message);
      }
      setSalvando(false);
    } else {
      setOk(true);
      setSalvando(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    marginTop: 6,
    marginBottom: 16,
    padding: "11px 12px",
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    fontSize: 15,
    boxSizing: "border-box",
    background: "#fff",
  };
  const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#101A26" };

  function dataHora(s: string) {
    const d = s.slice(8, 10) + "/" + s.slice(5, 7);
    const h = s.includes("T") ? s.split("T")[1].slice(0, 5) : "";
    return `${d} ${h}`.trim();
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F4F6F9", padding: 20 }}>
      <div
        style={{
          maxWidth: 460,
          margin: "0 auto",
          background: "#fff",
          border: "1px solid #E3E9F0",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 8px 30px rgba(16,26,38,.06)",
        }}
      >
        <a href="/" style={{ fontSize: 13, color: "#1F6FEB", textDecoration: "none" }}>
          ← Voltar ao painel
        </a>
        <h1 style={{ margin: "10px 0 2px", fontSize: 22 }}>Registrar chegada</h1>
        <p style={{ color: "#6B7A8D", fontSize: 14, marginBottom: 20 }}>
          Fecha um roteiro que está na rua.
        </p>

        {ok ? (
          <div>
            <div
              style={{
                background: "#E7F3EE",
                color: "#1B7A4B",
                borderRadius: 10,
                padding: 16,
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              Chegada registrada! Roteiro fechado.
            </div>
            <button
              onClick={() => {
                setOk(false);
                setRoteiroId("");
                setKm("");
                setObs("");
                setPendencia(false);
                setDescPend("");
                setCarregando(true);
                carregar();
              }}
              style={{
                width: "100%",
                padding: "11px",
                borderRadius: 8,
                border: "1px solid #CBD5E1",
                background: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                marginBottom: 10,
              }}
            >
              Registrar outra chegada
            </button>
            <a
              href="/"
              style={{
                display: "block",
                textAlign: "center",
                padding: "11px",
                borderRadius: 8,
                background: "#1F6FEB",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Ir para o painel
            </a>
          </div>
        ) : carregando ? (
          <p style={{ color: "#6B7A8D", fontSize: 14 }}>Carregando roteiros abertos…</p>
        ) : abertos.length === 0 ? (
          <p style={{ color: "#6B7A8D", fontSize: 14 }}>
            Nenhum roteiro aberto no momento. Registre uma saída primeiro.
          </p>
        ) : (
          <form onSubmit={salvar}>
            <label htmlFor="roteiro" style={labelStyle}>
              Roteiro aberto
            </label>
            <select
              id="roteiro"
              required
              value={roteiroId}
              onChange={(e) => selecionar(e.target.value)}
              style={inputStyle}
            >
              <option value="">Selecione…</option>
              {abertos.map((r) => {
                const v = one(r.veiculo);
                const t = one(r.tecnico);
                return (
                  <option key={r.id} value={r.id}>
                    {v?.modelo} {v?.placa} — {t?.nome} — saiu {dataHora(r.saida_em)} ({r.km_saida} km)
                  </option>
                );
              })}
            </select>

            {sel && (
              <>
                <label htmlFor="km" style={labelStyle}>
                  Km de chegada (saída: {sel.km_saida})
                </label>
                <input
                  id="km"
                  type="number"
                  inputMode="numeric"
                  required
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                  placeholder="ex.: 66655"
                  style={inputStyle}
                />

                <label htmlFor="tecc" style={labelStyle}>
                  Técnico na chegada
                </label>
                <select
                  id="tecc"
                  value={tecnicoChegadaId}
                  onChange={(e) => setTecnicoChegadaId(e.target.value)}
                  style={inputStyle}
                >
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>

                <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <input
                    type="checkbox"
                    checked={pendencia}
                    onChange={(e) => setPendencia(e.target.checked)}
                  />
                  Houve pendência no roteiro
                </label>
                {pendencia && (
                  <input
                    type="text"
                    value={descPend}
                    onChange={(e) => setDescPend(e.target.value)}
                    placeholder="descreva a pendência"
                    style={inputStyle}
                  />
                )}

                <label htmlFor="obs" style={labelStyle}>
                  Observação (opcional)
                </label>
                <input
                  id="obs"
                  type="text"
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="algo a registrar na chegada"
                  style={inputStyle}
                />
              </>
            )}

            <button
              type="submit"
              disabled={salvando || !sel}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 8,
                border: "none",
                background: salvando || !sel ? "#7CA0C9" : "#1F6FEB",
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                cursor: salvando || !sel ? "default" : "pointer",
              }}
            >
              {salvando ? "Registrando…" : "Registrar chegada"}
            </button>

            {erro && (
              <div style={{ color: "#C0392B", fontSize: 13, marginTop: 12 }}>{erro}</div>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
