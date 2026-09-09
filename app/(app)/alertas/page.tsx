"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// A fila do gestor. Tudo vem pronto da view v_alertas_ativos — nada e
// recalculado aqui. Cada alerta carrega o botao que resolve o problema.

type Alerta = {
  tipo: string;
  gravidade: string;
  ordem: number;
  veiculo_id: string;
  placa: string;
  modelo: string;
  titulo: string;
  detalhe: string | null;
  desde: string | null;
};

const CORES: Record<string, string> = {
  "CRÍTICO": "#C0392B",
  "ATENÇÃO": "#C08306",
};

const EMOJI: Record<string, string> = {
  "REVISÃO": "🔧",
  ROTEIRO: "📥",
  PARADO: "🅿️",
  "OCORRÊNCIA": "⚠️",
};

// Para onde o gestor vai para resolver cada tipo de alerta.
function acao(a: Alerta): { href: string; texto: string } {
  switch (a.tipo) {
    case "REVISÃO":
      return { href: "/manutencao", texto: "Abrir manutenção" };
    case "ROTEIRO":
      return { href: "/roteiro/chegada", texto: "Registrar a chegada" };
    case "OCORRÊNCIA":
      return { href: "/ocorrencias", texto: "Tratar ocorrência" };
    default:
      return { href: "/historico?placa=" + a.placa, texto: "Ver histórico" };
  }
}

function dataBR(s: string | null) {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : null;
}

export default function AlertasPage() {
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState("TODOS");

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("v_alertas_ativos")
        .select("*")
        .order("ordem")
        .order("placa");
      if (error) setErro(error.message);
      setAlertas((data as Alerta[]) ?? []);
      setCarregando(false);
    })();
  }, []);

  const tipos = ["TODOS", ...Array.from(new Set(alertas.map((a) => a.tipo)))];
  const lista = alertas.filter((a) => (tipo === "TODOS" ? true : a.tipo === tipo));
  const criticos = alertas.filter((a) => a.gravidade === "CRÍTICO").length;

  return (
    <main style={{ minHeight: "100vh", background: "#EBEEF4", padding: 20 }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <a href="/" style={{ fontSize: 13, color: "#2B4C8C", textDecoration: "none" }}>← Voltar ao painel</a>

        <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "10px 0 16px", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Alertas</h1>
          <span style={{ fontSize: 13, color: "#53607A" }}>
            {alertas.length === 0
              ? "nada pendente"
              : `${alertas.length} no total${criticos > 0 ? ` · ${criticos} crítico${criticos > 1 ? "s" : ""}` : ""}`}
          </span>
        </div>

        {tipos.length > 2 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
            {tipos.map((f) => (
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
                {f === "TODOS" ? "Tudo" : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        )}

        {carregando ? (
          <p style={{ color: "#53607A", fontSize: 14 }}>Carregando…</p>
        ) : erro ? (
          <div style={{ background: "#FBEAE7", color: "#A5301F", borderRadius: 10, padding: 16, fontSize: 13.5 }}>
            Não consegui ler os alertas: {erro}
            <div style={{ marginTop: 8, color: "#8A5A00" }}>
              Se a mensagem fala em <code>v_alertas_ativos</code>, a migration
              <code> 0007_alertas_ativos.sql</code> ainda não foi aplicada no Supabase.
            </div>
          </div>
        ) : lista.length === 0 ? (
          <div style={{ background: "#E7F3EE", color: "#1B7A4B", borderRadius: 12, padding: 20, fontSize: 14 }}>
            Nenhum alerta. Revisões em dia, nenhum roteiro em aberto de dias anteriores,
            nenhum veículo esquecido e nenhuma ocorrência grave sem tratamento.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {lista.map((a, i) => {
              const cor = CORES[a.gravidade] || "#8591A5";
              const act = acao(a);
              const quando = dataBR(a.desde);
              return (
                <div
                  key={`${a.tipo}-${a.veiculo_id}-${i}`}
                  style={{ background: "#fff", border: "1px solid #DBE0EA", borderLeft: `5px solid ${cor}`, borderRadius: 12, padding: 16, boxShadow: "0 1px 2px rgba(22,35,60,.05)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15 }}>{EMOJI[a.tipo] ?? "•"}</span>
                    <span style={{ fontWeight: 700, fontSize: 12.5, letterSpacing: ".04em", background: "#F4F6FB", border: "1px solid #C4CCDA", borderRadius: 6, padding: "2px 8px" }}>{a.placa}</span>
                    <span style={{ fontSize: 13, color: "#53607A" }}>{a.modelo}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", color: cor, background: cor + "18", borderRadius: 5, padding: "2px 8px" }}>{a.gravidade}</span>
                    {quando && <span style={{ marginLeft: "auto", fontSize: 12, color: "#8591A5" }}>desde {quando}</span>}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: 600, margin: "10px 0 3px", color: "#16233C" }}>{a.titulo}</div>
                  <div style={{ fontSize: 12.5, color: "#53607A" }}>{a.detalhe}</div>

                  <a
                    href={act.href}
                    style={{ display: "inline-block", marginTop: 12, border: "1px solid #DBE0EA", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, color: "#2B4C8C", textDecoration: "none" }}
                  >
                    {act.texto} →
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
