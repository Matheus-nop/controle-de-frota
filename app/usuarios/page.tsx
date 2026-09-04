"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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

const CORES: Record<string, string> = {
  GESTOR: "#2B4C8C",
  PCM: "#C08306",
  PONTO: "#1B9E6B",
  TECNICO: "#53607A",
};

const input: React.CSSProperties = {
  width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #CBD5E1",
  fontSize: 14, boxSizing: "border-box", background: "#fff",
};
const lbl: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#53607A", marginBottom: 4, display: "block",
};
const cartao: React.CSSProperties = {
  background: "#fff", border: "1px solid #E3E9F0", borderRadius: 12, padding: 16,
};
const botao: React.CSSProperties = {
  padding: "9px 16px", borderRadius: 8, border: "none", background: "#2B4C8C",
  color: "#fff", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
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

  async function carregar() {
    const supabase = createClient();
    await supabase.auth.getUser();

    const [pes, sem, mails, cfg] = await Promise.all([
      supabase.from("tecnicos").select("id, nome, papel, ativo, user_id").order("nome"),
      supabase.rpc("logins_sem_pessoa"),
      supabase.rpc("emails_do_time"),
      fetch("/api/usuarios").then((r) => r.json()).catch(() => ({})),
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
  }

  useEffect(() => {
    carregar();
  }, []);

  const semLogin = pessoas.filter((p) => !p.user_id);

  return (
    <main style={{ minHeight: "100vh", background: "#EBEEF4" }}>
      <header style={{ background: "linear-gradient(180deg,#17263F,#223B63)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logowhite.png" alt="Grupo Nova Opção" style={{ height: 30, display: "block" }} />
        <span style={{ color: "#AEB8C6", fontSize: 13, fontWeight: 600 }}>Usuários e acesso</span>
        <a href="/" style={{ marginLeft: "auto", color: "#C6D0DE", fontSize: 13, textDecoration: "none", fontWeight: 600 }}>
          ← Painel
        </a>
      </header>

      <div style={{ maxWidth: 820, margin: "0 auto", padding: 20 }}>
        <h1 style={{ fontSize: 21, margin: "4px 0 2px" }}>Quem entra no app</h1>
        <p style={{ color: "#53607A", fontSize: 14, marginBottom: 20 }}>
          O login nasce no Supabase; o nome e o papel nascem aqui.
        </p>

        <ComoCriar adminDisponivel={adminDisponivel} />

        <h2 style={{ fontSize: 15, margin: "24px 0 10px" }}>
          Logins aguardando cadastro
          {logins.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "#C08306", background: "#FAEFD6", borderRadius: 20, padding: "2px 9px" }}>
              {logins.length}
            </span>
          )}
        </h2>

        {erro && (
          <div style={{ ...cartao, color: "#8E2129", background: "#FAE5E7", borderColor: "#E9B7BC", fontSize: 13.5, marginBottom: 10 }}>
            {erro}
          </div>
        )}

        {!carregando && logins.length === 0 && !erro && (
          <div style={{ ...cartao, color: "#8591A5", fontSize: 13.5 }}>
            Nenhum login pendente. Todo mundo que entra no app tem nome e papel.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {logins.map((l) => (
            <Vincular key={l.user_id} login={l} semLogin={semLogin} onPronto={carregar} />
          ))}
        </div>

        <h2 style={{ fontSize: 15, margin: "26px 0 10px" }}>
          Cadastro {carregando ? "" : `· ${pessoas.length} pessoa(s)`}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pessoas.map((p) => (
            <Linha
              key={p.id}
              p={p}
              email={p.user_id ? emails[p.user_id] : undefined}
              adminDisponivel={adminDisponivel}
              onMudou={carregar}
            />
          ))}
          {!carregando && pessoas.length === 0 && (
            <div style={{ ...cartao, color: "#8591A5", fontSize: 13.5 }}>Ninguém cadastrado ainda.</div>
          )}
          {carregando && <div style={{ ...cartao, color: "#8591A5", fontSize: 13.5 }}>Carregando…</div>}
        </div>
      </div>
    </main>
  );
}

/* --------------------------- o passo no Supabase -------------------------- */
function ComoCriar({ adminDisponivel }: { adminDisponivel: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div style={{ ...cartao, border: "1px solid #C4CCDA", background: "#F4F6FB" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 650 }}>Criar um login novo</span>
        <span style={{ fontSize: 12.5, color: "#53607A" }}>
          é no painel do Supabase — depois ele aparece aqui embaixo
        </span>
        <button
          onClick={() => setAberto((x) => !x)}
          style={{ marginLeft: "auto", background: "#fff", border: "1px solid #C4CCDA", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, color: "#2B4C8C", cursor: "pointer" }}
        >
          {aberto ? "Fechar" : "Como faz"}
        </button>
      </div>

      {aberto && (
        <ol style={{ fontSize: 13.5, color: "#16233C", lineHeight: 1.65, margin: "12px 0 0", paddingLeft: 20 }}>
          <li>Supabase → <b>Authentication</b> → <b>Add user</b> → <b>Create new user</b>.</li>
          <li>
            E-mail: quem não tem e-mail de verdade usa o interno,{" "}
            <b>primeiro.ultimo@frota.local</b> (ex.: <code>marcia.souza@frota.local</code>).
            No app a pessoa digita só <b>marcia.souza</b> — o resto é completado sozinho.
          </li>
          <li>
            Senha: mínimo 8 caracteres. Marque <b>Auto Confirm User</b> — sem isso o
            Supabase espera uma confirmação por e-mail que nunca vai chegar num
            endereço <code>@frota.local</code>, e o login não entra.
          </li>
          <li>Volte aqui: o login aparece em <b>&ldquo;Logins aguardando cadastro&rdquo;</b>. Dê o nome e o papel.</li>
        </ol>
      )}

      {aberto && !adminDisponivel && (
        <p style={{ fontSize: 12, color: "#8591A5", marginTop: 12, lineHeight: 1.5 }}>
          Dá para criar o login direto por esta tela também, mas isso exige a chave{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code> no ambiente do app (Vercel → Settings →
          Environment Variables). Enquanto ela não existir, o caminho é o de cima — e ele
          funciona igual.
        </p>
      )}
    </div>
  );
}

/* ------------------------- login -> pessoa (o vínculo) -------------------- */
function Vincular({ login, semLogin, onPronto }: { login: Login; semLogin: Pessoa[]; onPronto: () => void }) {
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
    <div style={{ ...cartao, borderLeft: "5px solid #C08306" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontWeight: 650, fontSize: 14.5, fontFamily: "ui-monospace,monospace" }}>
          {soUsuario(login.email)}
        </span>
        <span style={{ fontSize: 12, color: "#8591A5" }}>{login.email}</span>
        <span style={{ fontSize: 11.5, color: "#C08306", fontWeight: 600, marginLeft: "auto" }}>
          sem nome e sem papel
        </span>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {semLogin.length > 0 && (
          <div>
            <label style={lbl}>Quem é</label>
            <select style={input} value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
              <option value="">➕ Pessoa nova</option>
              <optgroup label="Já cadastrado, ainda sem login">
                {semLogin.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </optgroup>
            </select>
            <div style={{ fontSize: 11.5, color: "#8591A5", marginTop: 4 }}>
              Quem já está no cadastro tem que ser escolhido aqui — criar de novo faria
              a mesma pessoa aparecer duas vezes nos roteiros.
            </div>
          </div>
        )}

        {!existente && (
          <div>
            <label style={lbl}>Nome completo</label>
            <input style={input} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Márcia Souza" />
            <div style={{ fontSize: 11.5, color: "#8591A5", marginTop: 4 }}>
              Chutado a partir do usuário. Confira: é o nome que vai em todo roteiro dela.
            </div>
          </div>
        )}

        <div>
          <label style={lbl}>Papel</label>
          <select style={input} value={papel} onChange={(e) => setPapel(e.target.value)}>
            {PAPEIS.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
          </select>
          <div style={{ fontSize: 11.5, color: "#8591A5", marginTop: 4 }}>{ajuda}</div>
        </div>
      </div>

      {erro && <div style={{ color: "#C0392B", fontSize: 13, marginTop: 10 }}>{erro}</div>}

      <button
        onClick={vincular}
        disabled={salvando || (!existente && !nome.trim())}
        style={{ ...botao, marginTop: 14, opacity: salvando || (!existente && !nome.trim()) ? 0.6 : 1 }}
      >
        {salvando ? "Vinculando…" : existente ? `Este login é do ${existente.nome.split(" ")[0]}` : "Cadastrar pessoa"}
      </button>
    </div>
  );
}

/* ------------------------------ uma pessoa ------------------------------- */
function Linha({
  p, email, adminDisponivel, onMudou,
}: { p: Pessoa; email?: string; adminDisponivel: boolean; onMudou: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [papel, setPapel] = useState(p.papel);
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cor = CORES[p.papel] ?? "#53607A";

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
    <div style={{ ...cartao, borderLeft: `5px solid ${cor}`, opacity: p.ativo ? 1 : 0.62 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 650, fontSize: 14.5 }}>{p.nome}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", color: cor, background: cor + "18", borderRadius: 5, padding: "2px 8px" }}>
          {p.papel}
        </span>
        {email && (
          <span style={{ fontSize: 12, color: "#8591A5", fontFamily: "ui-monospace,monospace" }}>
            {soUsuario(email)}
          </span>
        )}
        {!p.user_id && <span style={{ fontSize: 11.5, color: "#C08306", fontWeight: 600 }}>sem login</span>}
        {!p.ativo && <span style={{ fontSize: 11.5, color: "#C0392B", fontWeight: 600 }}>desligado</span>}
        <button
          onClick={() => setAberto((x) => !x)}
          style={{ marginLeft: "auto", background: "none", border: "1px solid #DBE0EA", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, color: "#2B4C8C", cursor: "pointer" }}
        >
          {aberto ? "Fechar" : "Gerenciar"}
        </button>
      </div>

      {aviso && <div style={{ color: "#1B7A4B", fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>{aviso}</div>}
      {erro && <div style={{ color: "#C0392B", fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>{erro}</div>}

      {aberto && (
        <div style={{ marginTop: 14, display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
          <div>
            <label style={lbl}>Papel</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select style={input} value={papel} onChange={(e) => setPapel(e.target.value)}>
                {PAPEIS.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
              </select>
              <button
                onClick={() => enviar({ papel }, "Papel atualizado.")}
                disabled={salvando || papel === p.papel}
                style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #C4CCDA", background: "#fff", fontSize: 13, fontWeight: 600, cursor: papel === p.papel ? "default" : "pointer", opacity: papel === p.papel ? 0.5 : 1, whiteSpace: "nowrap" }}
              >
                Salvar
              </button>
            </div>
          </div>

          <div>
            <label style={lbl}>Senha</label>
            {adminDisponivel ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={input} value={senha} minLength={8} disabled={!p.user_id}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder={p.user_id ? "mínimo 8 caracteres" : "não tem login ainda"}
                />
                <button
                  onClick={() => enviar({ senha }, "Senha trocada. Passe para a pessoa.")}
                  disabled={salvando || senha.length < 8}
                  style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #C4CCDA", background: "#fff", fontSize: 13, fontWeight: 600, cursor: senha.length < 8 ? "default" : "pointer", opacity: senha.length < 8 ? 0.5 : 1, whiteSpace: "nowrap" }}
                >
                  Trocar
                </button>
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: "#53607A", lineHeight: 1.5, paddingTop: 4 }}>
                No Supabase: <b>Authentication</b> → o usuário{email ? <> <code>{email}</code></> : null} →{" "}
                <b>Reset password</b>.
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={() =>
                enviar({ ativo: !p.ativo }, p.ativo ? "Desligado: não entra mais no app." : "Reativado.")
              }
              disabled={salvando}
              style={{ width: "100%", padding: "9px 14px", borderRadius: 8, border: `1px solid ${p.ativo ? "#E9B7BC" : "#B6DECB"}`, background: "#fff", color: p.ativo ? "#C0392B" : "#146848", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {p.ativo ? "Desligar da equipe" : "Reativar"}
            </button>
          </div>
        </div>
      )}

      {aberto && (
        <p style={{ fontSize: 11.5, color: "#8591A5", marginTop: 12, lineHeight: 1.5 }}>
          Desligar tira a pessoa das listas do app e o histórico dela — roteiros,
          checklists, ocorrências — continua todo lá, com o nome.
          {!adminDisponivel && p.user_id && (
            <> Para ela parar de <b>entrar</b>, bloqueie o login no Supabase:{" "}
              <b>Authentication</b> → o usuário → <b>Ban user</b>.</>
          )}
        </p>
      )}
    </div>
  );
}
