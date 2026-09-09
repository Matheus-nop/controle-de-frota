"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Logo, Simbolo } from "@/components/Logo";
import { Botao, Campo, Input } from "@/components/ui";

// Tecnico entra so com o usuario (ex.: "leonardo"); o dominio interno e
// acrescentado aqui. Gestor entra com o e-mail real completo.
const DOMINIO_INTERNO = "@frota.local";

function paraLogin(entrada: string): string {
  const v = entrada.trim().toLowerCase();
  return v.includes("@") ? v : v.replace(/\s+/g, "") + DOMINIO_INTERNO;
}

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
      email: paraLogin(email),
      password: senha,
    });

    if (error) {
      setErro(
        error.message.toLowerCase().includes("invalid")
          ? "Usuário ou senha incorretos."
          : error.message,
      );
      setCarregando(false);
    } else {
      // recarrega na raiz; o proxy manda cada papel para a tela dele.
      window.location.href = "/";
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo altura={44} />
        </div>

        <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center gap-2.5">
            <Simbolo tamanho={32} />
            <div className="leading-tight">
              <h1 className="text-base font-semibold text-slate-900">Frota</h1>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-acento-600">
                Veículos &amp; manutenção
              </p>
            </div>
          </div>

          <p className="mt-3 rounded-md bg-slate-50 px-2.5 py-1.5 text-[12px] text-slate-500 ring-1 ring-slate-200">
            <b className="text-slate-700">Técnico:</b> digite só o seu usuário (ex.: <code>igor</code>). O
            app completa com <code>{DOMINIO_INTERNO}</code>.
          </p>

          <form onSubmit={entrar} className="mt-4 space-y-3">
            <Campo rotulo="Usuário ou e-mail">
              {/* type="text", não "email": o técnico digita só o primeiro nome, e a
                  validação do navegador barraria um valor sem "@". */}
              <Input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                placeholder="igor  ou  nome@empresa.com.br"
              />
            </Campo>

            <Campo rotulo="Senha">
              <Input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Campo>

            {erro && <p className="text-sm text-red-700">{erro}</p>}

            <Botao type="submit" variante="primario" tamanho="lg" className="w-full" disabled={carregando}>
              {carregando ? "Entrando…" : "Entrar"}
            </Botao>
          </form>
        </div>

        <p className="mt-4 text-center text-[11.5px] text-slate-400">
          Grupo Nova Opção · uso interno
        </p>
      </div>
    </div>
  );
}
