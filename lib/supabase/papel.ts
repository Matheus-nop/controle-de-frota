import { createClient } from "@/lib/supabase/server";

export type Papel = "GESTOR" | "TECNICO" | null;

export interface Sessao {
  papel: Papel;
  nome: string | null;
  tecnicoId: string | null;
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
      papel: data.papel === "GESTOR" ? "GESTOR" : "TECNICO",
      nome: data.nome ?? null,
      tecnicoId: data.id ?? null,
    };
  } catch {
    return { papel: null, nome: null, tecnicoId: null };
  }
}
