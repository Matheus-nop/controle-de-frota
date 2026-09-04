import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rotas que nao exigem login.
const ROTAS_PUBLICAS = ["/login", "/auth", "/api/health"];

type Papel = "GESTOR" | "PCM" | "PONTO" | "TECNICO";

// Quem entra onde. A RLS ja decide os DADOS; isto so evita que a pessoa caia
// numa tela que ela nao vai conseguir usar.
//
// A ordem importa: vale a PRIMEIRA rota que casar, e "/" e comparada exata
// (senao ela casaria com o site inteiro).
//
// Cuidado com os dois parecidos: /ocorrencia (singular) e o relato do tecnico
// e fica livre; /ocorrencias (plural) e a fila do gestor.
const ACESSO: Array<{ rota: string; papeis: Papel[] }> = [
  { rota: "/veiculos", papeis: ["GESTOR"] },
  { rota: "/usuarios", papeis: ["GESTOR"] },
  { rota: "/relatorios", papeis: ["GESTOR"] },
  { rota: "/ocorrencias", papeis: ["GESTOR"] },
  { rota: "/historico", papeis: ["GESTOR", "PCM"] },
  { rota: "/alertas", papeis: ["GESTOR", "PCM"] },
  { rota: "/manutencao", papeis: ["GESTOR", "PCM"] },
  { rota: "/ponto", papeis: ["GESTOR", "PONTO"] },
  { rota: "/", papeis: ["GESTOR", "PCM"] },
];

// Onde cada papel cai quando bate numa porta que nao e dele.
// Espelha telaInicial() de lib/supabase/papel.ts.
function telaInicial(papel: Papel): string {
  if (papel === "GESTOR" || papel === "PCM") return "/";
  if (papel === "PONTO") return "/ponto";
  return "/campo";
}

function regraDe(path: string) {
  return ACESSO.find(({ rota }) =>
    rota === "/" ? path === "/" : path === rota || path.startsWith(rota + "/"),
  );
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: nao rode codigo entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const publico = ROTAS_PUBLICAS.some(
    (r) => path === r || path.startsWith(r + "/"),
  );

  if (!user && !publico) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // So consulta o cadastro nas rotas que precisam decidir por papel.
  const regra = user ? regraDe(path) : undefined;

  if (user && regra) {
    const { data } = await supabase
      .from("tecnicos")
      .select("papel")
      .eq("user_id", user.id)
      .maybeSingle();

    // Sem cadastro em tecnicos, trata como TECNICO: e o papel mais restrito.
    const papel = (data?.papel as Papel) ?? "TECNICO";

    if (!regra.papeis.includes(papel)) {
      const url = request.nextUrl.clone();
      url.pathname = telaInicial(papel);
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
