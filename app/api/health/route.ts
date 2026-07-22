import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Health-check: confirma que o env do Supabase esta preenchido e que da para
// alcancar o projeto. Rota publica (ver ROTAS_PUBLICAS no middleware).
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(url),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(anon),
  };

  if (!url || !anon) {
    return NextResponse.json(
      { ok: false, env, erro: "Variaveis de ambiente do Supabase ausentes." },
      { status: 503 },
    );
  }

  try {
    const supabase = await createClient();
    // getSession nao depende de RLS e confirma que o cliente inicializa.
    const { error } = await supabase.auth.getSession();
    if (error) throw error;

    return NextResponse.json({ ok: true, env, supabase: "alcancavel" });
  } catch (e) {
    const erro = e instanceof Error ? e.message : "erro desconhecido";
    return NextResponse.json({ ok: false, env, erro }, { status: 502 });
  }
}
