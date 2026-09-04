"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { diaISO } from "@/lib/frota/tempo";

// Conferência de ponto: uma linha por roteiro, com a hora que o veículo saiu e
// a hora que voltou, para bater com a marcação da folha.
//
// A tela é de leitura e não tem km nem custo — quem confere ponto não precisa
// do custo da frota, e o que não aparece não vaza. Quem entra aqui é o papel
// PONTO (e o gestor); a RLS de `roteiros` é quem garante isso de verdade.
//
// Tudo que é hora vem pronto da view v_conferencia_ponto, já no fuso de São
// Paulo. Nenhuma conta de horário acontece nesta tela — a lição do bug de
// fuso de agosto foi essa: hora se calcula num lugar só.

type Linha = {
  id: string;
  dia: string; // YYYY-MM-DD, o dia da saída em São Paulo
  placa: string;
  modelo: string;
  tecnico_saida: string;
  tecnico_chegada: string | null;
  hora_saida: string | null; // HH:MM:SS
  hora_chegada: string | null;
  duracao_min: number | null;
  virou_o_dia: boolean;
  dia_chegada: string | null;
  em_aberto: boolean;
};

function hhmm(t: string | null) {
  return t ? t.slice(0, 5) : "—";
}

function duracao(min: number | null) {
  if (min == null || min < 0) return "—";
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h${String(min % 60).padStart(2, "0")}` : `${min}min`;
}

function dataBR(s: string | null) {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—";
}

const input: React.CSSProperties = {
  width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #CBD5E1",
  fontSize: 14, boxSizing: "border-box", background: "#fff",
};
const lbl: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#53607A", marginBottom: 4, display: "block",
};
const td: React.CSSProperties = {
  padding: "10px 10px", borderTop: "1px solid #E3E9F0", fontSize: 13.5, whiteSpace: "nowrap",
};
const th: React.CSSProperties = {
  padding: "9px 10px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em",
  color: "#8591A5", fontWeight: 700, textAlign: "left", whiteSpace: "nowrap",
};

export default function PontoPage() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  // O caminho de volta só existe para quem tem para onde voltar: o gestor.
  // Para o papel PONTO esta é a tela inicial — um "← Painel" ali mandaria a
  // pessoa para "/", que o proxy devolve na hora para cá. Botão que parece
  // quebrado é pior do que botão que não existe.
  const [ehGestor, setEhGestor] = useState(false);

  const hoje = diaISO(new Date());
  const quinzeDias = diaISO(new Date(Date.now() - 15 * 24 * 60 * 60 * 1000));

  const [de, setDe] = useState(quinzeDias);
  const [ate, setAte] = useState(hoje);
  const [tecnico, setTecnico] = useState("");

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const supabase = createClient();
    // O refresh do token corre em paralelo com a query e devolve 401 se a
    // query sair primeiro; getUser() espera o token ficar bom.
    await supabase.auth.getUser();

    // `dia` já é a data local calculada na view — filtro direto, sem a
    // conversão de janela UTC que /historico precisa fazer sobre timestamptz.
    const { data, error } = await supabase
      .from("v_conferencia_ponto")
      .select("*")
      .gte("dia", de)
      .lte("dia", ate)
      .order("dia", { ascending: false })
      .order("hora_saida", { ascending: true });

    if (error) setErro(error.message);
    setLinhas((data as Linha[]) ?? []);
    setCarregando(false);
  }, [de, ate]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("tecnicos").select("papel").eq("user_id", user.id).maybeSingle();
      setEhGestor((data as { papel?: string } | null)?.papel === "GESTOR");
    })();
  }, []);

  const tecnicos = Array.from(new Set(linhas.map((l) => l.tecnico_saida))).sort();
  const visiveis = tecnico ? linhas.filter((l) => l.tecnico_saida === tecnico) : linhas;

  const emAberto = visiveis.filter((l) => l.em_aberto).length;
  const viraram = visiveis.filter((l) => l.virou_o_dia).length;
  const totalMin = visiveis.reduce((s, l) => s + (l.duracao_min ?? 0), 0);

  function baixarCSV() {
    const cab = ["dia", "placa", "veiculo", "tecnico_saida", "tecnico_chegada",
      "hora_saida", "hora_chegada", "dia_chegada", "duracao", "virou_o_dia", "situacao"];
    const linhasCsv = [cab];
    visiveis.forEach((l) => linhasCsv.push([
      l.dia, l.placa, l.modelo, l.tecnico_saida, l.tecnico_chegada ?? "",
      hhmm(l.hora_saida), hhmm(l.hora_chegada), l.dia_chegada ?? "",
      duracao(l.duracao_min), l.virou_o_dia ? "sim" : "não",
      l.em_aberto ? "sem chegada registrada" : "fechado",
    ]));
    const csv = linhasCsv
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    // BOM na frente: sem ele o Excel abre "JOÃO" como "JOÃO".
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `conferencia-ponto-${de}-a-${ate}.csv`;
    a.click();
  }

  return (
    <main style={{ minHeight: "100vh", background: "#EBEEF4" }}>
      <header style={{ background: "linear-gradient(180deg,#17263F,#223B63)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logowhite.png" alt="Grupo Nova Opção" style={{ height: 30, display: "block" }} />
        <span style={{ color: "#AEB8C6", fontSize: 13, fontWeight: 600 }}>Conferência de ponto</span>
        {ehGestor && (
          <a href="/" style={{ marginLeft: "auto", color: "#C6D0DE", fontSize: 13, textDecoration: "none", fontWeight: 600 }}>
            ← Painel
          </a>
        )}
        <form action="/auth/signout" method="post" style={{ marginLeft: ehGestor ? 0 : "auto" }}>
          <button type="submit" style={{ background: "transparent", border: "1px solid #3A527E", color: "#C6D0DE", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            Sair
          </button>
        </form>
      </header>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
        <h1 style={{ fontSize: 21, margin: "4px 0 2px" }}>Horários dos roteiros</h1>
        <p style={{ color: "#53607A", fontSize: 14, marginBottom: 18 }}>
          O que a equipe registrou ao sair e ao voltar. Compare com a marcação da folha.
        </p>

        <section style={{ background: "#fff", border: "1px solid #E3E9F0", borderRadius: 12, padding: 14, marginBottom: 16, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
          <div>
            <label style={lbl} htmlFor="de">De</label>
            <input id="de" style={input} type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div>
            <label style={lbl} htmlFor="ate">Até</label>
            <input id="ate" style={input} type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div>
            <label style={lbl} htmlFor="tec">Técnico</label>
            <select id="tec" style={input} value={tecnico} onChange={(e) => setTecnico(e.target.value)}>
              <option value="">Todos</option>
              {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={baixarCSV}
              disabled={visiveis.length === 0}
              style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #C4CCDA", background: "#fff", fontSize: 13.5, fontWeight: 600, cursor: visiveis.length ? "pointer" : "default", opacity: visiveis.length ? 1 : 0.55 }}
            >
              ↧ Baixar CSV
            </button>
          </div>
        </section>

        <section style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 16 }}>
          {[
            ["Roteiros", String(visiveis.length), "no período"],
            ["Tempo somado", duracao(totalMin), "só os fechados"],
            ["Sem chegada", String(emAberto), emAberto > 0 ? "confirmar com o técnico" : "tudo fechado"],
            ["Viraram o dia", String(viraram), "ponto em dois dias"],
          ].map(([t, v, sub]) => (
            <div key={t} style={{ background: "#fff", border: "1px solid #E3E9F0", borderRadius: 12, padding: "13px 15px" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "#8591A5", fontWeight: 600 }}>{t}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>{v}</div>
              <div style={{ fontSize: 11.5, color: "#53607A", marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </section>

        {erro && (
          <div style={{ background: "#FAE5E7", color: "#8E2129", borderRadius: 10, padding: 14, fontSize: 13.5, marginBottom: 14 }}>
            {erro}
          </div>
        )}

        <div style={{ background: "#fff", border: "1px solid #E3E9F0", borderRadius: 12, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Dia</th>
                <th style={th}>Técnico</th>
                <th style={th}>Veículo</th>
                <th style={th}>Saída</th>
                <th style={th}>Chegada</th>
                <th style={th}>Tempo fora</th>
                <th style={th}>Observação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <tr key={l.id} style={l.em_aberto ? { background: "#FDF6E7" } : undefined}>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{dataBR(l.dia)}</td>
                  <td style={td}>
                    {l.tecnico_saida}
                    {l.tecnico_chegada && l.tecnico_chegada !== l.tecnico_saida && (
                      <span style={{ color: "#8591A5" }}> → {l.tecnico_chegada}</span>
                    )}
                  </td>
                  <td style={{ ...td, color: "#53607A" }}>{l.modelo} · {l.placa}</td>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>{hhmm(l.hora_saida)}</td>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums", fontWeight: 650 }}>
                    {hhmm(l.hora_chegada)}
                    {l.virou_o_dia && (
                      <span style={{ color: "#C08306", fontSize: 11, fontWeight: 700 }}> +1</span>
                    )}
                  </td>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{duracao(l.duracao_min)}</td>
                  <td style={{ ...td, color: "#8591A5", fontSize: 12.5, whiteSpace: "normal" }}>
                    {l.em_aberto
                      ? "chegada não registrada"
                      : l.virou_o_dia
                        ? "voltou em " + dataBR(l.dia_chegada)
                        : ""}
                  </td>
                </tr>
              ))}
              {!carregando && visiveis.length === 0 && (
                <tr>
                  <td style={{ ...td, color: "#8591A5", textAlign: "center" }} colSpan={7}>
                    Nenhum roteiro no período escolhido.
                  </td>
                </tr>
              )}
              {carregando && (
                <tr>
                  <td style={{ ...td, color: "#8591A5", textAlign: "center" }} colSpan={7}>
                    Carregando…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p style={{ color: "#8591A5", fontSize: 12.5, marginTop: 14, lineHeight: 1.5 }}>
          A linha amarela é roteiro sem chegada registrada: o horário de volta ainda não
          existe, não é zero. <b>+1</b> ao lado da chegada quer dizer que o roteiro virou o
          dia — o ponto dessa pessoa cai em dois dias.
        </p>
      </div>
    </main>
  );
}
