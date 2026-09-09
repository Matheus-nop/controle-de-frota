import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16: "proxy" substitui o antigo "middleware". Roda no runtime Node
// (nao no Edge), entao o cliente Supabase (@supabase/ssr) funciona aqui.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

// O que NAO passa pelo proxy. Sao arquivos estaticos: pedir login para eles nao
// protege nada e quebra coisas.
//
// `webmanifest` entrou depois, e o motivo merece registro: o navegador busca o
// manifesto ANTES de alguem entrar, e sem login ele recebia um redirecionamento
// para /login. Resultado: o Chrome nao encontrava nome, icone nem cor do app, e
// "Instalar" nao aparecia — o PWA de campo, que e como o tecnico usa isto no
// celular, simplesmente nao instalava. O manifesto nao tem nada secreto: nome,
// icones e cores, tudo publico por natureza.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
  ],
};
