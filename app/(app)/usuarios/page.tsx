"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Aviso,
  Badge,
  Botao,
  Campo,
  Cartao,
  Carregando,
  Input,
  Pagina,
  Select,
  cx,
  type Tom,
} from "@/components/ui";

// Cadastro de acesso.
//
// O login é criado no painel do Supabase (Authentication → Add user), por
// decisão do gestor — assim a chave `service_role` não precisa existir no
// ambiente do app. Só que criar o login resolve metade: o app não conhece
// ninguém por e-mail. Todo nome que aparece em roteiro, checklist e manutenção
// é FK para `tecnicos`, e um login sem essa linha entra no sistema e não é
// ninguém.
//
// Esta tela é a outra metade. Ela lista os logins que ainda não viraram pessoa
// (função logins_sem_pessoa, migration 0012) e o gestor completa com nome e
// papel. Depois disso, papel e desligamento também se resolvem aqui.
//
// Se um dia a SUPABASE_SERVICE_ROLE_KEY for configurada no Vercel, o bloco de
// criar login direto pelo app aparece sozinho — a tela pergunta ao servidor
// (/api/usuarios) o que ela pode oferecer.

type Pessoa = {
  id: string;
  nome: string;
  papel: string;
  ativo: boolean;
  user_id: string | null;
};
type Login = { user_id: string; email: string; criado_em: string };

const PAPEIS = [
  { valor: "TECNICO", rotulo: "Técnico", ajuda: "Lança roteiro, checklist e ocorrência. Vê só o que é dele." },
  { valor: "GESTOR", rotulo: "Gestor", ajuda: "Painel completo, veículos, ocorrências e cadastro de acesso." },
  { valor: "PCM", rotulo: "PCM", ajuda: "Manutenção, checklists e alertas. Não cadastra veículo nem lança roteiro." },
  { valor: "PONTO", rotulo: "Ponto", ajuda: "Só lê o horário dos roteiros, em /ponto. Não escreve em nada." },
];

const TOM_PAPEL: Record<string, Tom> = {
  GESTOR: "info",
  PCM: "atencao",
  PONTO: "ok",
  TECNICO: "mudo",
};
const FAIXA_PAPEL: Record<string, string> = {
  GESTOR: "border-l-brand-600",
  PCM: "border-l-amber-500",
  PONTO: "border-l-emerald-600",
  TECNICO: "border-l-slate-300",
};

// "marcia.souza@frota.local" -> "marcia.souza". É o que a pessoa digita.
function soUsuario(email: string) {
  return email.replace(/@frota\.local$/i, "");
}

// "marcia.souza" -> "Marcia Souza". Chute de nome para o gestor corrigir, não
// para gravar às cegas: o nome é o que aparece em todo roteiro dela.
function chutarNome(email: string) {
  return soUsuario(email)
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export default function UsuariosPage() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [logins, setLogins] = useState<Login[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [adminDisponivel, setAdminDisponivel] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.getUser();

    const [pes, sem, mails, cfg] = await Promise.all([
      supabase.from("tecnicos").select("id, nome, papel, ativo, user_id").order("nome"),
      supabase.rpc("logins_sem_pessoa"),
      supabase.rpc("emails_do_time"),
      fetch("/api/usuarios")
        .then((r) => r.json())
        .catch(() => ({})),
    ]);

    setPessoas((pes.data as Pessoa[]) ?? []);
    // Se a migration 0012 ainda não rodou, isto volta com erro: a tela perde a
    // lista de logins novos, não a página.
    setLogins((sem.data as Login[]) ?? []);
    setErro(sem.error ? "Rode a migration 0012 para listar os logins novos." : null);
    setEmails(
      Object.fromEntries(
        ((mails.data as { user_id: string; email: string }[]) ?? []).map((m) => [m.user_id, m.email]),
      ),
    );
    setAdminDisponivel(!!cfg.adminDisponivel);
    setCarregando(false);
  }, []);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, [carregar]);

  const semLogin = pessoas.filter((p) => !p.user_id);

  return (
    <Pagina
      titulo="Quem entra no app"
      subtitulo="O login nasce no Supabase; o nome e o papel nascem aqui."
    >
      <ComoCriar adminDisponivel={adminDisponivel} />

      <h2 className="mb-2.5 mt-6 flex items-center gap-2 text-[15px] font-semibold text-slate-900">
        Logins aguardando cadastro
        {logins.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[12px] font-bold tabular-nums text-amber-700">
            {logins.length}
          </span>
        )}
      </h2>

      {erro && <Aviso>{erro}</Aviso>}

      {!carregando && logins.length === 0 && !erro && (
        <Cartao className="px-4 py-3.5 text-[13.5px] text-slate-500">
          Nenhum login pendente. Todo mundo que entra no app tem nome e papel.
        </Cartao>
      )}

      <div className="flex flex-col gap-2.5">
        {logins.map((l) => (
          <Vincular key={l.user_id} login={l} semLogin={semLogin} onPronto={carregar} />
        ))}
      </div>

      <h2 className="mb-2.5 mt-6 text-[15px] font-semibold text-slate-900">
        Cadastro {carregando ? "" : `· ${pessoas.length} pessoa(s)`}
      </h2>
      <div className="flex flex-col gap-2.5">
        {pessoas.map((p) => (
          <LinhaPessoa
            key={p.id}
            p={p}
            email={p.user_id ? emails[p.user_id] : undefined}
            adminDisponivel={adminDisponivel}
            onMudou={carregar}
          />
        ))}
        {!carregando && pessoas.length === 0 && (
          <Cartao className="px-4 py-3.5 text-[13.5px] text-slate-500">Ninguém cadastrado ainda.</Cartao>
        )}
        {carregando && (
          <Cartao>
            <Carregando />
          </Cartao>
        )}
      </div>
    </Pagina>
  );
}

/* --------------------------- o passo no Supabase -------------------------- */
function ComoCriar({ adminDisponivel }: { adminDisponivel: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Cartao className="bg-slate-50 p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-sm font-semibold text-slate-900">Criar um login novo</span>
        <span className="text-[12.5px] text-slate-500">
          é no painel do Supabase — depois ele aparece aqui embaixo
        </span>
        <Botao tamanho="sm" className="ml-auto" onClick={() => setAberto((x) => !x)}>
          {aberto ? "Fechar" : "Como faz"}
        </Botao>
      </div>

      {aberto && (
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-slate-700">
          <li>
            Supabase → <b>Authentication</b> → <b>Add user</b> → <b>Create new user</b>.
          </li>
          <li>
            E-mail: quem não tem e-mail de verdade usa o interno,{" "}
            <b>primeiro.ultimo@frota.local</b> (ex.: <code>marcia.souza@frota.local</code>). No app a
            pessoa digita só <b>marcia.souza</b> — o resto é completado sozinho.
          </li>
          <li>
            Senha: mínimo 8 caracteres. Marque <b>Auto Confirm User</b> — sem isso o Supabase espera
            uma confirmação por e-mail que nunca vai chegar num endereço <code>@frota.local</code>, e
            o login não entra.
          </li>
          <li>
            Volte aqui: o login aparece em <b>&ldquo;Logins aguardando cadastro&rdquo;</b>. Dê o nome
            e o papel.
          </li>
        </ol>
      )}

      {aberto && !adminDisponivel && (
        <p className="mt-3 text-[12px] leading-relaxed text-slate-400">
          Dá para criar o login direto por esta tela também, mas isso exige a chave{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> no ambiente do app (Vercel → Settings → Environment
          Variables). Enquanto ela não existir, o caminho é o de cima — e ele funciona igual.
        </p>
      )}
    </Cartao>
  );
}

/* ------------------------- login -> pessoa (o vínculo) -------------------- */
function Vincular({
  login,
  semLogin,
  onPronto,
}: {
  login: Login;
  semLogin: Pessoa[];
  onPronto: () => void;
}) {
  const [tecnicoId, setTecnicoId] = useState(""); // "" = pessoa nova
  const [nome, setNome] = useState(chutarNome(login.email));
  const [papel, setPapel] = useState("TECNICO");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const existente = semLogin.find((p) => p.id === tecnicoId);
  const ajuda = PAPEIS.find((x) => x.valor === papel)?.ajuda;

  async function vincular() {
    setErro(null);
    setSalvando(true);
    const supabase = createClient();

    // Pessoa que já existe: só ganha o user_id. `is("user_id", null)` evita
    // roubar o login de quem já tem um — a condição vai no banco, não na tela.
    const r = existente
      ? await supabase
          .from("tecnicos")
          .update({ user_id: login.user_id, papel, ativo: true })
          .eq("id", existente.id)
          .is("user_id", null)
          .select("id")
          .maybeSingle()
      : await supabase
          .from("tecnicos")
          .insert({ user_id: login.user_id, nome: nome.trim(), papel, ativo: true })
          .select("id")
          .maybeSingle();

    setSalvando(false);
    if (r.error || !r.data) {
      setErro(r.error?.message ?? "Essa pessoa já tem login. Escolha outra.");
      return;
    }
    onPronto();
  }

  return (
    <Cartao className="border-l-4 border-l-amber-500 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <span className="font-mono text-[14.5px] font-semibold text-slate-900">
          {soUsuario(login.email)}
        </span>
        <span className="text-[12px] text-slate-400">{login.email}</span>
        <span className="ml-auto text-[11.5px] font-semibold text-amber-700">
          sem nome e sem papel
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">
        {semLogin.length > 0 && (
          <Campo
            rotulo="Quem é"
            dica="Quem já está no cadastro tem que ser escolhido aqui — criar de novo faria a mesma pessoa aparecer duas vezes nos roteiros."
          >
            <Select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
              <option value="">Pessoa nova</option>
              <optgroup label="Já cadastrado, ainda sem login">
                {semLogin.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </optgroup>
            </Select>
          </Campo>
        )}

        {!existente && (
          <Campo
            rotulo="Nome completo"
            dica="Chutado a partir do usuário. Confira: é o nome que vai em todo roteiro dela."
          >
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Márcia Souza" />
          </Campo>
        )}

        <Campo rotulo="Papel" dica={ajuda}>
          <Select value={papel} onChange={(e) => setPapel(e.target.value)}>
            {PAPEIS.map((x) => (
              <option key={x.valor} value={x.valor}>
                {x.rotulo}
              </option>
            ))}
          </Select>
        </Campo>
      </div>

      {erro && (
        <div className="mt-2.5">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      <Botao
        variante="primario"
        className="mt-3.5"
        onClick={vincular}
        disabled={salvando || (!existente && !nome.trim())}
      >
        {salvando
          ? "Vinculando…"
          : existente
            ? `Este login é do ${existente.nome.split(" ")[0]}`
            : "Cadastrar pessoa"}
      </Botao>
    </Cartao>
  );
}

/* ------------------------------ uma pessoa ------------------------------- */
function LinhaPessoa({
  p,
  email,
  adminDisponivel,
  onMudou,
}: {
  p: Pessoa;
  email?: string;
  adminDisponivel: boolean;
  onMudou: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [papel, setPapel] = useState(p.papel);
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function enviar(mudanca: Record<string, unknown>, recado: string) {
    setSalvando(true);
    setErro(null);
    setAviso(null);
    const r = await fetch("/api/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tecnicoId: p.id, ...mudanca }),
    });
    const corpo = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) {
      setErro(corpo.erro ?? "Não deu para salvar.");
      return;
    }
    // O servidor avisa quando salvou só metade — desligar sem a chave admin
    // tira das listas mas não bloqueia o login.
    setAviso(corpo.aviso ?? recado);
    setSenha("");
    onMudou();
  }

  return (
    <Cartao
      className={cx("border-l-4 p-4", FAIXA_PAPEL[p.papel] ?? "border-l-slate-300", !p.ativo && "opacity-60")}
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-[14.5px] font-semibold text-slate-900">{p.nome}</span>
        <Badge tom={TOM_PAPEL[p.papel] ?? "mudo"}>{p.papel}</Badge>
        {email && <span className="font-mono text-[12px] text-slate-400">{soUsuario(email)}</span>}
        {!p.user_id && <span className="text-[11.5px] font-semibold text-amber-700">sem login</span>}
        {!p.ativo && <span className="text-[11.5px] font-semibold text-red-700">desligado</span>}
        <Botao tamanho="sm" className="ml-auto" onClick={() => setAberto((x) => !x)}>
          {aberto ? "Fechar" : "Gerenciar"}
        </Botao>
      </div>

      {aviso && <p className="mt-2 text-[12.5px] leading-relaxed text-emerald-700">{aviso}</p>}
      {erro && <p className="mt-2 text-[12.5px] leading-relaxed text-red-700">{erro}</p>}

      {aberto && (
        <>
          <div className="mt-3.5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
            <Campo rotulo="Papel">
              <div className="flex gap-2">
                <Select value={papel} onChange={(e) => setPapel(e.target.value)}>
                  {PAPEIS.map((x) => (
                    <option key={x.valor} value={x.valor}>
                      {x.rotulo}
                    </option>
                  ))}
                </Select>
                <Botao
                  className="shrink-0"
                  onClick={() => enviar({ papel }, "Papel atualizado.")}
                  disabled={salvando || papel === p.papel}
                >
                  Salvar
                </Botao>
              </div>
            </Campo>

            <Campo rotulo="Senha">
              {adminDisponivel ? (
                <div className="flex gap-2">
                  <Input
                    value={senha}
                    minLength={8}
                    disabled={!p.user_id}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder={p.user_id ? "mínimo 8 caracteres" : "não tem login ainda"}
                  />
                  <Botao
                    className="shrink-0"
                    onClick={() => enviar({ senha }, "Senha trocada. Passe para a pessoa.")}
                    disabled={salvando || senha.length < 8}
                  >
                    Trocar
                  </Botao>
                </div>
              ) : (
                <p className="pt-1 text-[12.5px] leading-relaxed text-slate-600">
                  No Supabase: <b>Authentication</b> → o usuário
                  {email ? (
                    <>
                      {" "}
                      <code>{email}</code>
                    </>
                  ) : null}{" "}
                  → <b>Reset password</b>.
                </p>
              )}
            </Campo>

            <div className="flex items-end">
              <Botao
                variante={p.ativo ? "perigo" : "secundario"}
                className={cx("w-full", !p.ativo && "text-emerald-700 ring-emerald-200")}
                onClick={() =>
                  enviar(
                    { ativo: !p.ativo },
                    p.ativo ? "Desligado: não entra mais no app." : "Reativado.",
                  )
                }
                disabled={salvando}
              >
                {p.ativo ? "Desligar da equipe" : "Reativar"}
              </Botao>
            </div>
          </div>

          <p className="mt-3 text-[11.5px] leading-relaxed text-slate-400">
            Desligar tira a pessoa das listas do app e o histórico dela — roteiros, checklists,
            ocorrências — continua todo lá, com o nome.
            {!adminDisponivel && p.user_id && (
              <>
                {" "}
                Para ela parar de <b>entrar</b>, bloqueie o login no Supabase: <b>Authentication</b> →
                o usuário → <b>Ban user</b>.
              </>
            )}
          </p>
        </>
      )}
    </Cartao>
  );
}
