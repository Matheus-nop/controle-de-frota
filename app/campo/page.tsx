"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Aberto = {
  id: string;
  saida_em: string;
  km_saida: number;
  veiculo: { placa: string; modelo: string } | { placa: string; modelo: string }[] | null;
  tecnico: { nome: string } | { nome: string }[] | null;
};

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export default function CampoPage() {
  const [abertos, setAbertos] = useState<Aberto[]>([]);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      await supabase.auth.getUser();
      const { data } = await supabase
        .from("roteiros")
        .select("id, saida_em, km_saida, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_saida_id(nome)")
        .is("chegada_em", null)
        .order("saida_em");
      setAbertos((data as Aberto[]) ?? []);
    })();
  }, []);

  function hora(s: string) {
    return s.includes("T") ? s.split("T")[1].slice(0, 5) : "";
  }

  const acoes = [
    { href: "/roteiro/saida", emoji: "📤", titulo: "Registrar saída", sub: "Vou pegar um veículo", cor: "#2B4C8C" },
    { href: "/roteiro/chegada", emoji: "📥", titulo: "Registrar chegada", sub: "Voltei / fechar roteiro", cor: "#1B9E6B" },
    { href: "/checklist", emoji: "✅", titulo: "Checklist do veículo", sub: "Vistoria semanal", cor: "#0E2544" },
  ];

  return (
    <main style={{ minHeight: "100vh", background: "#EBEEF4" }}>
      <header style={{ background: "linear-gradient(180deg,#17263F,#223B63)", padding: "16px 20px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logowhite.png" alt="Grupo Nova Opção" style={{ height: 30, display: "block" }} />
      </header>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: 20 }}>
        <h1 style={{ fontSize: 22, margin: "4px 0 2px" }}>Bom trabalho! 👷</h1>
        <p style={{ color: "#53607A", fontSize: 14, marginBottom: 20 }}>O que você vai fazer agora?</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {acoes.map((a) => (
            <a
              key={a.href}
              href={a.href}
              style={{
                display: "flex", alignItems: "center", gap: 14, textDecoration: "none",
                background: "#fff", border: "1px solid #DBE0EA", borderLeft: `5px solid ${a.cor}`,
                borderRadius: 14, padding: "18px 16px", boxShadow: "0 1px 2px rgba(22,35,60,.05)",
              }}
            >
              <span style={{ fontSize: 30, lineHeight: 1 }}>{a.emoji}</span>
              <span>
                <span style={{ display: "block", fontSize: 17, fontWeight: 700, color: "#16233C" }}>{a.titulo}</span>
                <span style={{ display: "block", fontSize: 13, color: "#53607A", marginTop: 2 }}>{a.sub}</span>
              </span>
              <span style={{ marginLeft: "auto", color: a.cor, fontSize: 22, fontWeight: 700 }}>›</span>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <h2 style={{ fontSize: 14, margin: 0, textTransform: "uppercase", letterSpacing: ".04em", color: "#53607A" }}>Na rua agora</h2>
            <span style={{ background: "#2B4C8C", color: "#fff", fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "1px 8px" }}>{abertos.length}</span>
          </div>
          {abertos.length === 0 ? (
            <p style={{ fontSize: 13, color: "#8591A5" }}>Nenhum veículo na rua no momento.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {abertos.map((r) => {
                const v = one(r.veiculo);
                const t = one(r.tecnico);
                return (
                  <a key={r.id} href="/roteiro/chegada" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", background: "#fff", border: "1px solid #DBE0EA", borderRadius: 10, padding: "11px 12px" }}>
                    <span style={{ fontWeight: 700, fontSize: 12, letterSpacing: ".04em", color: "#16233C", background: "#F4F6FB", border: "1px solid #C4CCDA", borderRadius: 6, padding: "2px 7px" }}>{v?.placa}</span>
                    <span style={{ fontSize: 13, color: "#53607A" }}>{t?.nome}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "#8591A5" }}>saiu {hora(r.saida_em)}</span>
                  </a>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: 28, textAlign: "center" }}>
          <a href="/" style={{ fontSize: 13, color: "#53607A", textDecoration: "none" }}>Painel completo (gestor) →</a>
        </div>
      </div>
    </main>
  );
}
