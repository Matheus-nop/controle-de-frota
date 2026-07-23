"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: senha,
    });

    if (error) {
      setErro(error.message);
      setCarregando(false);
    } else {
      window.location.href = "/";
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    marginTop: 6,
    marginBottom: 14,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid #CBD5E1",
    fontSize: 14,
    boxSizing: "border-box",
  };

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
          Acesso do gestor com e-mail e senha.
        </p>

        <form onSubmit={entrar}>
          <label htmlFor="email" style={{ fontSize: 13, fontWeight: 600 }}>
            E-mail
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com.br"
            style={inputStyle}
          />

          <label htmlFor="senha" style={{ fontSize: 13, fontWeight: 600 }}>
            Senha
          </label>
          <input
            id="senha"
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="sua senha"
            style={inputStyle}
          />

          <button
            type="submit"
            disabled={carregando}
            style={{
              width: "100%",
              padding: "11px 12px",
              borderRadius: 8,
              border: "none",
              background: carregando ? "#7CA0C9" : "#1F6FEB",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: carregando ? "default" : "pointer",
            }}
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>

          {erro && (
            <div style={{ color: "#C0392B", fontSize: 13, marginTop: 12 }}>
              {erro}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}
