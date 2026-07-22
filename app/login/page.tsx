"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [estado, setEstado] = useState<"idle" | "enviando" | "enviado" | "erro">(
    "idle",
  );
  const [msg, setMsg] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    setMsg(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setEstado("erro");
      setMsg(error.message);
    } else {
      setEstado("enviado");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          border: "1px solid #E3E9F0",
          borderRadius: 14,
          padding: 28,
          boxShadow: "0 8px 30px rgba(16,26,38,.06)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "#6B7A8D",
            fontWeight: 700,
          }}
        >
          Controle de frota
        </div>
        <h1 style={{ margin: "4px 0 2px", fontSize: 22 }}>Painel</h1>
        <p style={{ color: "#6B7A8D", fontSize: 14, marginBottom: 20 }}>
          Acesso do gestor por link magico no e-mail.
        </p>

        {estado === "enviado" ? (
          <div
            style={{
              background: "#E7F3EE",
              color: "#1B7A4B",
              borderRadius: 10,
              padding: 16,
              fontSize: 14,
            }}
          >
            Link enviado para <strong>{email}</strong>. Abra o e-mail neste
            dispositivo para entrar.
          </div>
        ) : (
          <form onSubmit={enviar}>
            <label
              htmlFor="email"
              style={{ fontSize: 13, fontWeight: 600, color: "#101A26" }}
            >
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com.br"
              style={{
                width: "100%",
                marginTop: 6,
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #CBD5E1",
                fontSize: 14,
                boxSizing: "border-box",
              }}
            />
            <button
              type="submit"
              disabled={estado === "enviando"}
              style={{
                width: "100%",
                padding: "11px 12px",
                borderRadius: 8,
                border: "none",
                background: estado === "enviando" ? "#7CA0C9" : "#1F6FEB",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: estado === "enviando" ? "default" : "pointer",
              }}
            >
              {estado === "enviando" ? "Enviando..." : "Enviar link de acesso"}
            </button>
            {estado === "erro" && msg && (
              <div style={{ color: "#C0392B", fontSize: 13, marginTop: 12 }}>
                {msg}
              </div>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
