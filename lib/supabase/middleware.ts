import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rotas que nao exigem login.
const ROTAS_PUBLICAS = ["/login", "/auth", "/api/health"];

// Rotas exclusivas do GESTOR. Tecnico que tentar entrar volta para /campo.
// Atencao: /ocorrencia (singular, o relato do tecnico) NAO entra aqui — quem
// e do gestor e a fila /ocorrencias (plural).
const ROTAS_GESTOR = ["/veiculos", "/ocorrencias"];

// A raiz "/" e o painel do gestor; o tecnico e mandado para /campo.
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

  // Guarda por papel: so consulta o cadastro nas rotas que precisam decidir.
  const precisaPapel = path === "/" || ROTAS_GESTOR.some((r) => path === r || path.startsWith(r + "/"));

  if (user && precisaPapel) {
    const { data } = await supabase
      .from("tecnicos")
      .select("papel")
      .eq("user_id", user.id)
      .maybeSingle();

    const ehGestor = data?.papel === "GESTOR";
    if (!ehGestor) {
      const url = request.nextUrl.clone();
      url.pathname = "/campo";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
