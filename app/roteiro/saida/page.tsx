"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Veiculo = { id: string; placa: string; modelo: string; km_atual: number | null };
type Tecnico = { id: string; nome: string };

export default function RegistrarSaidaPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);

  const [veiculoId, setVeiculoId] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [km, setKm] = useState("");
  const [obs, setObs] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [v, t] = await Promise.all([
        supabase
          .from("veiculos")
          .select("id, placa, modelo, km_atual")
          .eq("status", "ATIVO")
          .order("placa"),
        supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
      ]);
      setVeiculos((v.data as Veiculo[]) ?? []);
      setTecnicos((t.data as Tecnico[]) ?? []);
      setCarregandoDados(false);
    })();
  }, []);

  const veiculoSel = veiculos.find((x) => x.id === veiculoId);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const kmNum = parseInt(km, 10);
    if (!veiculoId || !tecnicoId || Number.isNaN(kmNum)) {
      setErro("Preencha veículo, técnico e o km de saída.");
      return;
    }
    if (veiculoSel?.km_atual != null && kmNum < veiculoSel.km_atual) {
      setErro(
        `O km de saída (${kmNum}) é menor que o último km do veículo (${veiculoSel.km_atual}). Confira o hodômetro.`,
      );
      return;
    }

    setSalvando(true);
    const supabase = createClient();
    const { error } = await supabase.from("roteiros").insert({
      veiculo_id: veiculoId,
      tecnico_saida_id: tecnicoId,
      saida_em: new Date().toISOString(),
      km_saida: kmNum,
      obs_saida: obs.trim() || null,
    });

    if (error) {
      if (error.code === "23505") {
        setErro(
          "Já existe um roteiro ABERTO para este veículo. Registre a chegada dele antes de abrir um novo.",
        );
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
        <h1 style={{ margin: "10px 0 2px", fontSize: 22 }}>Registrar saída</h1>
        <p style={{ color: "#6B7A8D", fontSize: 14, marginBottom: 20 }}>
          Abre um roteiro para o veículo. A chegada é registrada depois.
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
              Saída registrada! O veículo está na rua.
            </div>
            <button
              onClick={() => {
                setOk(false);
                setVeiculoId("");
                setTecnicoId("");
                setKm("");
                setObs("");
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
              Registrar outra saída
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
        ) : carregandoDados ? (
          <p style={{ color: "#6B7A8D", fontSize: 14 }}>Carregando veículos e técnicos…</p>
        ) : (
          <form onSubmit={salvar}>
            <label htmlFor="veiculo" style={labelStyle}>
              Veículo
            </label>
            <select
              id="veiculo"
              required
              value={veiculoId}
              onChange={(e) => setVeiculoId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Selecione…</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.modelo} — {v.placa}
                  {v.km_atual != null ? ` (${v.km_atual} km)` : ""}
                </option>
              ))}
            </select>

            <label htmlFor="tecnico" style={labelStyle}>
              Técnico
            </label>
            <select
              id="tecnico"
              required
              value={tecnicoId}
              onChange={(e) => setTecnicoId(e.target.value)}
              style={inputStyle}
            >
              <option value="">Selecione…</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>

            <label htmlFor="km" style={labelStyle}>
              Km de saída
            </label>
            <input
              id="km"
              type="number"
              inputMode="numeric"
              required
              value={km}
              onChange={(e) => setKm(e.target.value)}
              placeholder="ex.: 66402"
              style={inputStyle}
            />

            <label htmlFor="obs" style={labelStyle}>
              Observação (opcional)
            </label>
            <input
              id="obs"
              type="text"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="algo a registrar na saída"
              style={inputStyle}
            />

            <button
              type="submit"
              disabled={salvando}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: 8,
                border: "none",
                background: salvando ? "#7CA0C9" : "#1F6FEB",
                color: "#fff",
                fontSize: 15,
                fontWeight: 600,
                cursor: salvando ? "default" : "pointer",
              }}
            >
              {salvando ? "Registrando…" : "Registrar saída"}
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
