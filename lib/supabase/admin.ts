import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente com a chave `service_role`. Ela ignora RLS e pode criar login —
// e por isso NUNCA pode chegar ao navegador.
//
// Tres cuidados que fazem isso ser seguro:
//   1. a variavel NAO tem o prefixo NEXT_PUBLIC_, entao o Next nao a embute no
//      bundle do cliente;
//   2. este arquivo so e importado por Route Handlers (app/api/...), que rodam
//      no servidor;
//   3. quem chama a rota ainda precisa provar que e GESTOR, com o cookie de
//      sessao normal — a chave admin executa a acao, nao autoriza ninguem.
//
// No Vercel: Settings -> Environment Variables -> SUPABASE_SERVICE_ROLE_KEY
// (Supabase -> Project Settings -> API -> service_role, "secret").

export function criarClienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Sem a chave a tela de usuarios avisa em portugues em vez de estourar 500.
  if (!url || !chave) return null;

  return createSupabaseClient(url, chave, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
