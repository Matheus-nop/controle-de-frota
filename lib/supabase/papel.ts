import { createClient } from "@/lib/supabase/server";

export type Papel = "GESTOR" | "PCM" | "PONTO" | "TECNICO" | null;

export interface Sessao {
  papel: Papel;
  nome: string | null;
  tecnicoId: string | null;
}

// Os quatro papeis do cadastro. Qualquer coisa fora da lista cai em TECNICO —
// e o papel mais restrito, entao errar para ca nao abre porta nenhuma.
const PAPEIS: Papel[] = ["GESTOR", "PCM", "PONTO", "TECNICO"];

function normalizar(valor: unknown): Papel {
  return PAPEIS.includes(valor as Papel) ? (valor as Papel) : "TECNICO";
}

// Onde cada papel cai ao entrar. Espelha lib/supabase/middleware.ts.
export function telaInicial(papel: Papel): string {
  if (papel === "GESTOR" || papel === "PCM") return "/";
  if (papel === "PONTO") return "/ponto";
  return "/campo";
}

// Quem esta logado e qual o papel dele. Usado nas paginas para decidir o que
// mostrar. A RLS (Fase 2) ja limita os DADOS; isto limita a NAVEGACAO.
export async function sessaoAtual(): Promise<Sessao> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { papel: null, nome: null, tecnicoId: null };

    const { data } = await supabase
      .from("tecnicos")
      .select("id, nome, papel")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data) {
      // Logado mas sem cadastro em tecnicos: trata como tecnico sem vinculo.
      return { papel: "TECNICO", nome: user.email ?? null, tecnicoId: null };
    }
    return {
      papel: normalizar(data.papel),
      nome: data.nome ?? null,
      tecnicoId: data.id ?? null,
    };
  } catch {
    return { papel: null, nome: null, tecnicoId: null };
  }
}
