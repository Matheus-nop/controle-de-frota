"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Cadastro de acesso. Substitui o SQL colado na mão em auth.users — que é
// como os primeiros logins foram criados e como nasceu o bug do `{}`.
//
// A tela é só a cara: quem cria de fato é /api/usuarios, no servidor, com a
// chave admin do Supabase. Nada de chave secreta neste arquivo — ele roda no
// navegador do gestor.
//
// Regra que a tela protege: nome de pessoa é FK para `tecnicos`. Quem já está
// no cadastro sem login (técnico antigo, alguém importado da planilha) ganha
// acesso pelo bloco "dar acesso a quem já está cadastrado" — nunca virando um
// segundo registro com o mesmo nome.

type Pessoa = {
  id: string;
  nome: string;
  papel: string;
  ativo: boolean;
  user_id: string | null;
};

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

// "Márcia Souza" -> "marcia.souza". Mesma regra do servidor; aqui é só para o
// gestor ver o usuário antes de salvar.
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

export default function UsuariosPage() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [carregando, setCarregando] = useState(true);

  async function carregar() {
    const supabase = createClient();
    await supabase.auth.getUser();
    const { data } = await supabase
      .from("tecnicos")
      .select("id, nome, papel, ativo, user_id")
      .order("nome");
    setPessoas((data as Pessoa[]) ?? []);
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
          Crie o acesso, troque a senha de quem esqueceu e desligue quem saiu da equipe.
        </p>

        <NovoAcesso semLogin={semLogin} onPronto={carregar} />

        <h2 style={{ fontSize: 15, margin: "26px 0 10px" }}>
          Cadastro {carregando ? "" : `· ${pessoas.length} pessoa(s)`}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pessoas.map((p) => <Linha key={p.id} p={p} onMudou={carregar} />)}
          {!carregando && pessoas.length === 0 && (
            <div style={{ ...cartao, color: "#8591A5", fontSize: 13.5 }}>Ninguém cadastrado ainda.</div>
          )}
          {carregando && (
            <div style={{ ...cartao, color: "#8591A5", fontSize: 13.5 }}>Carregando…</div>
          )}
        </div>
      </div>
    </main>
  );
}

/* ------------------------------- criar ---------------------------------- */
function NovoAcesso({ semLogin, onPronto }: { semLogin: Pessoa[]; onPronto: () => void }) {
  const [tecnicoId, setTecnicoId] = useState(""); // "" = pessoa nova
  const [nome, setNome] = useState("");
  const [usuario, setUsuario] = useState("");
  const [papel, setPapel] = useState("TECNICO");
  const [senha, setSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ usuario: string; senha: string; nome: string } | null>(null);

  const existente = semLogin.find((p) => p.id === tecnicoId);
  const nomeEfetivo = existente ? existente.nome : nome;
  const usuarioEfetivo = usuario.trim() || sugerirUsuario(nomeEfetivo);
  const ajuda = PAPEIS.find((x) => x.valor === papel)?.ajuda;

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setFeito(null);
    setSalvando(true);

    const r = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tecnicoId: tecnicoId || null,
        nome: nomeEfetivo,
        usuario: usuarioEfetivo,
        papel,
        senha,
      }),
    });
    const corpo = await r.json().catch(() => ({}));
    setSalvando(false);

    if (!r.ok) {
      setErro(corpo.erro ?? "Não foi possível criar o acesso.");
      return;
    }
    setFeito({ usuario: corpo.usuario, senha, nome: corpo.nome });
    setTecnicoId("");
    setNome("");
    setUsuario("");
    setSenha("");
    setPapel("TECNICO");
    onPronto();
  }

  return (
    <form onSubmit={criar} style={{ ...cartao, border: "1px solid #2B4C8C" }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 15 }}>Criar acesso</h2>

      {feito && (
        <div style={{ background: "#E5F4EE", border: "1px solid #B6DECB", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#146848" }}>
            Acesso criado para {feito.nome}.
          </div>
          <p style={{ fontSize: 13, color: "#146848", margin: "6px 0 0", lineHeight: 1.5 }}>
            Usuário <b>{feito.usuario}</b> · senha <b>{feito.senha}</b><br />
            Anote agora e mande por canal privado — a senha não aparece de novo.
          </p>
        </div>
      )}

      {semLogin.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <label style={lbl} htmlFor="quem">Quem</label>
          <select id="quem" style={input} value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
            <option value="">➕ Pessoa nova</option>
            <optgroup label="Já cadastrado, ainda sem login">
              {semLogin.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </optgroup>
          </select>
          <div style={{ fontSize: 11.5, color: "#8591A5", marginTop: 4 }}>
            Quem já está no cadastro deve ser escolhido aqui — criar de novo faria a
            mesma pessoa aparecer duas vezes nos roteiros.
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        {!existente && (
          <div>
            <label style={lbl} htmlFor="nome">Nome completo</label>
            <input
              id="nome" style={input} value={nome} required
              onChange={(e) => setNome(e.target.value)}
              placeholder="ex.: Márcia Souza"
            />
          </div>
        )}
        <div>
          <label style={lbl} htmlFor="usuario">Usuário de login</label>
          <input
            id="usuario" style={input} value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder={sugerirUsuario(nomeEfetivo) || "ex.: marcia.souza"}
          />
          <div style={{ fontSize: 11.5, color: "#8591A5", marginTop: 4 }}>
            {usuarioEfetivo ? <>Vai entrar digitando <b>{usuarioEfetivo}</b></> : "Deixe em branco para usar o nome"}
          </div>
        </div>
        <div>
          <label style={lbl} htmlFor="papel">Papel</label>
          <select id="papel" style={input} value={papel} onChange={(e) => setPapel(e.target.value)}>
            {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
          </select>
          <div style={{ fontSize: 11.5, color: "#8591A5", marginTop: 4 }}>{ajuda}</div>
        </div>
        <div>
          <label style={lbl} htmlFor="senha">Senha provisória</label>
          <input
            id="senha" style={input} value={senha} required minLength={8}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="mínimo 8 caracteres"
          />
          <div style={{ fontSize: 11.5, color: "#8591A5", marginTop: 4 }}>
            Você vê a senha uma vez, aqui. Depois só dá para trocar.
          </div>
        </div>
      </div>

      {erro && <div style={{ color: "#C0392B", fontSize: 13, marginTop: 12 }}>{erro}</div>}

      <button
        type="submit"
        disabled={salvando || (!existente && !nome.trim()) || senha.length < 8}
        style={{
          marginTop: 14, padding: "10px 18px", borderRadius: 9, border: "none",
          background: salvando ? "#7CA0C9" : "#2B4C8C", color: "#fff",
          fontSize: 14, fontWeight: 600, cursor: salvando ? "default" : "pointer",
        }}
      >
        {salvando ? "Criando…" : "Criar acesso"}
      </button>
    </form>
  );
}

/* ------------------------------ uma pessoa ------------------------------- */
function Linha({ p, onMudou }: { p: Pessoa; onMudou: () => void }) {
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
    setAviso(recado);
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
        {!p.user_id && (
          <span style={{ fontSize: 11.5, color: "#C08306", fontWeight: 600 }}>sem login</span>
        )}
        {!p.ativo && (
          <span style={{ fontSize: 11.5, color: "#C0392B", fontWeight: 600 }}>desligado</span>
        )}
        <button
          onClick={() => setAberto((x) => !x)}
          style={{ marginLeft: "auto", background: "none", border: "1px solid #DBE0EA", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, color: "#2B4C8C", cursor: "pointer" }}
        >
          {aberto ? "Fechar" : "Gerenciar"}
        </button>
      </div>

      {aviso && <div style={{ color: "#1B7A4B", fontSize: 12.5, marginTop: 8 }}>{aviso}</div>}
      {erro && <div style={{ color: "#C0392B", fontSize: 12.5, marginTop: 8 }}>{erro}</div>}

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
            <label style={lbl}>Nova senha</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={input} value={senha} minLength={8}
                onChange={(e) => setSenha(e.target.value)}
                placeholder={p.user_id ? "mínimo 8 caracteres" : "crie o acesso primeiro"}
                disabled={!p.user_id}
              />
              <button
                onClick={() => enviar({ senha }, "Senha trocada. Passe para a pessoa.")}
                disabled={salvando || senha.length < 8}
                style={{ padding: "9px 14px", borderRadius: 8, border: "1px solid #C4CCDA", background: "#fff", fontSize: 13, fontWeight: 600, cursor: senha.length < 8 ? "default" : "pointer", opacity: senha.length < 8 ? 0.5 : 1, whiteSpace: "nowrap" }}
              >
                Trocar
              </button>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              onClick={() =>
                enviar(
                  { ativo: !p.ativo },
                  p.ativo ? "Desligado: não entra mais no app." : "Reativado.",
                )
              }
              disabled={salvando}
              style={{ width: "100%", padding: "9px 14px", borderRadius: 8, border: `1px solid ${p.ativo ? "#E9B7BC" : "#B6DECB"}`, background: "#fff", color: p.ativo ? "#C0392B" : "#146848", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              {p.ativo ? "Desligar da equipe" : "Reativar"}
            </button>
          </div>
        </div>
      )}

      {aberto && p.ativo && (
        <p style={{ fontSize: 11.5, color: "#8591A5", marginTop: 12, lineHeight: 1.5 }}>
          Desligar bloqueia o login e tira a pessoa das listas. O histórico dela —
          roteiros, checklists, ocorrências — continua todo lá, com o nome.
        </p>
      )}
    </div>
  );
}
