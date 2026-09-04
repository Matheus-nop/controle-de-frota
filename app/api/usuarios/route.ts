import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { criarClienteAdmin } from "@/lib/supabase/admin";

// Cadastro de acesso, feito pelo app em vez de SQL na mao.
//
// O que era o `supabase/manual/cadastrar_pcm_e_ponto.sql` vira esta rota. A
// diferenca que importa: criar login pela API do GoTrue (auth.admin.createUser)
// nao depende de acertar as colunas de token de `auth.users` — foi um insert
// manual sem elas que fez o login responder `{}` em agosto.
//
// Autorizacao em duas camadas, e as duas precisam passar:
//   1. o cookie de sessao diz quem esta chamando, e so GESTOR passa;
//   2. so depois disso a chave admin entra em acao.
// A chave admin sozinha nunca autoriza nada aqui.

const DOMINIO_INTERNO = "@frota.local";
const PAPEIS = ["TECNICO", "GESTOR", "PCM", "PONTO"];

// "Márcia Souza" -> "marcia.souza". Sem acento, sem espaco: e o que a pessoa
// vai digitar no login, muitas vezes num teclado de celular.
function sugerirUsuario(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(".");
}

function paraEmail(usuario: string): string {
  const v = usuario.trim().toLowerCase();
  return v.includes("@") ? v : v.replace(/\s+/g, "") + DOMINIO_INTERNO;
}

function erro(mensagem: string, status = 400) {
  return NextResponse.json({ erro: mensagem }, { status });
}

type Guarda = {
  resposta: NextResponse | null;
  supabase: Awaited<ReturnType<typeof createClient>> | null;
};

// Só passa daqui quem está logado E é gestor.
async function exigirGestor(): Promise<Guarda> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { resposta: erro("Faça login novamente.", 401), supabase: null };

  const { data } = await supabase
    .from("tecnicos").select("papel").eq("user_id", user.id).maybeSingle();
  if (data?.papel !== "GESTOR") {
    return { resposta: erro("Só o gestor cadastra acesso.", 403), supabase: null };
  }
  return { resposta: null, supabase };
}

// A tela pergunta o que ela pode oferecer. Sem a chave admin no ambiente,
// criar login e trocar senha ficam com o painel do Supabase — o resto do
// cadastro (vincular pessoa, papel, desligar) funciona do mesmo jeito.
export async function GET() {
  const guarda = await exigirGestor();
  if (guarda.resposta) return guarda.resposta;
  return NextResponse.json({ adminDisponivel: criarClienteAdmin() !== null });
}

export async function POST(request: Request) {
  const guarda = await exigirGestor();
  if (guarda.resposta) return guarda.resposta;

  const admin = criarClienteAdmin();
  if (!admin) {
    return erro(
      "Falta a variável SUPABASE_SERVICE_ROLE_KEY no ambiente do app. " +
        "No Vercel: Settings → Environment Variables.",
      503,
    );
  }

  const corpo = await request.json().catch(() => null);
  if (!corpo) return erro("Requisição inválida.");

  const nome = String(corpo.nome ?? "").trim();
  const papel = String(corpo.papel ?? "TECNICO");
  const senha = String(corpo.senha ?? "");
  // `tecnicoId` preenchido = pessoa que já existe no cadastro e vai ganhar
  // login agora. Sem ele, cria a pessoa junto. Evita o mesmo técnico virar
  // dois registros — e nome de pessoa é FK, não texto solto.
  const tecnicoId = corpo.tecnicoId ? String(corpo.tecnicoId) : null;
  const usuario = String(corpo.usuario ?? "").trim() || sugerirUsuario(nome);

  if (!tecnicoId && !nome) return erro("Informe o nome da pessoa.");
  if (!usuario) return erro("Informe o usuário de login.");
  if (senha.length < 8) return erro("A senha precisa de pelo menos 8 caracteres.");
  if (!PAPEIS.includes(papel)) return erro("Papel inválido.");

  const email = paraEmail(usuario);

  // 1. o login
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true, // não existe caixa de entrada em @frota.local
  });
  if (erroAuth || !criado?.user) {
    const m = (erroAuth?.message ?? "").toLowerCase();
    if (m.includes("already") || m.includes("registered")) {
      return erro(`O usuário "${usuario}" já existe. Escolha outro.`, 409);
    }
    return erro(erroAuth?.message ?? "Não foi possível criar o login.", 500);
  }

  // 2. a pessoa. Se falhar, o login recém-criado é desfeito — senão sobra um
  //    acesso órfão, que entra no app e não é ninguém.
  const vinculo = tecnicoId
    ? await guarda.supabase!
        .from("tecnicos")
        .update({ user_id: criado.user.id, papel, ativo: true })
        .eq("id", tecnicoId)
        .is("user_id", null) // não rouba o login de quem já tem
        .select("id, nome")
        .maybeSingle()
    : await guarda.supabase!
        .from("tecnicos")
        .insert({ user_id: criado.user.id, nome, papel, ativo: true })
        .select("id, nome")
        .maybeSingle();

  if (vinculo.error || !vinculo.data) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return erro(
      vinculo.error?.message ??
        "Essa pessoa já tem um login. Use “trocar senha” em vez de criar outro.",
      409,
    );
  }

  return NextResponse.json({
    ok: true,
    id: vinculo.data.id,
    nome: vinculo.data.nome,
    usuario,
    email,
    papel,
  });
}

export async function PATCH(request: Request) {
  const guarda = await exigirGestor();
  if (guarda.resposta) return guarda.resposta;

  const corpo = await request.json().catch(() => null);
  if (!corpo?.tecnicoId) return erro("Requisição inválida.");

  const supabase = guarda.supabase!;
  const { data: pessoa } = await supabase
    .from("tecnicos").select("id, user_id").eq("id", String(corpo.tecnicoId)).maybeSingle();
  if (!pessoa) return erro("Pessoa não encontrada.", 404);

  // papel e ativo passam pela RLS normal: é o gestor escrevendo como ele mesmo
  const campos: Record<string, unknown> = {};
  if (corpo.papel !== undefined) {
    if (!PAPEIS.includes(String(corpo.papel))) return erro("Papel inválido.");
    campos.papel = corpo.papel;
  }
  if (corpo.ativo !== undefined) campos.ativo = !!corpo.ativo;

  if (Object.keys(campos).length > 0) {
    const { error } = await supabase.from("tecnicos").update(campos).eq("id", pessoa.id);
    if (error) return erro(error.message, 500);
  }

  // senha e bloqueio de login só existem no lado do auth
  const trocaSenha = typeof corpo.senha === "string" && corpo.senha.length > 0;
  const mudaAtivo = corpo.ativo !== undefined;

  if (trocaSenha || mudaAtivo) {
    // Sem login não há senha nem bloqueio a mexer — mas `ativo` já foi salvo.
    if (!pessoa.user_id) {
      return trocaSenha
        ? erro("Essa pessoa ainda não tem login. Crie o acesso primeiro.")
        : NextResponse.json({ ok: true });
    }

    const admin = criarClienteAdmin();

    // Sem a chave admin, o papel e o `ativo` já foram gravados acima e valem.
    // O que NÃO dá para fazer daqui é mexer no login — e é preciso dizer isso
    // em voz alta: desligar sem bloquear o login deixa a pessoa entrando com a
    // senha antiga, e o gestor precisa saber que falta um passo no Supabase.
    if (!admin) {
      if (trocaSenha) {
        return erro(
          "Trocar senha só pelo painel do Supabase: Authentication → o usuário → " +
            "Reset password. (Para fazer por aqui, configure SUPABASE_SERVICE_ROLE_KEY.)",
          503,
        );
      }
      return NextResponse.json({
        ok: true,
        aviso: corpo.ativo
          ? "Papel e situação salvos. Se o login estava banido no Supabase, libere por lá."
          : "Tirado das listas do app. O login ainda funciona: bloqueie em " +
            "Authentication → o usuário → Ban user.",
      });
    }

    if (trocaSenha && String(corpo.senha).length < 8) {
      return erro("A senha precisa de pelo menos 8 caracteres.");
    }

    const alteracao: { password?: string; ban_duration?: string } = {};
    if (trocaSenha) alteracao.password = String(corpo.senha);
    // Inativo tem que parar de ENTRAR, não só sumir das listas: sem o ban a
    // pessoa desligada continuaria logando com a senha antiga.
    if (mudaAtivo) alteracao.ban_duration = corpo.ativo ? "none" : "876000h";

    const { error } = await admin.auth.admin.updateUserById(pessoa.user_id, alteracao);
    if (error) return erro(error.message, 500);
  }

  return NextResponse.json({ ok: true });
}
