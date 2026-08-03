"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Veiculo = { id: string; placa: string; modelo: string; status: string };
type Tecnico = { id: string; nome: string };

const TIPOS: [string, string][] = [
  ["DANO", "Dano no veículo (bati, riscou, quebrou)"],
  ["ACIDENTE", "Acidente (colisão, envolveu outro veículo)"],
  ["AVARIA", "Avaria / defeito que apareceu"],
  ["OUTRO", "Outro"],
];

const GRAVIDADES: [string, string, string][] = [
  ["LEVE", "Leve", "#1B9E6B"],
  ["MODERADA", "Moderada", "#C08306"],
  ["GRAVE", "Grave", "#C0392B"],
];

export default function OcorrenciaPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [euId, setEuId] = useState<string | null>(null);
  const [euNome, setEuNome] = useState<string | null>(null);
  const [ehGestor, setEhGestor] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const hoje = new Date().toISOString().slice(0, 10);

  const [veiculoId, setVeiculoId] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [tipo, setTipo] = useState("");
  const [data, setData] = useState(hoje);
  const [local, setLocal] = useState("");
  const [gravidade, setGravidade] = useState("");
  const [terceiros, setTerceiros] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [fotos, setFotos] = useState<FileList | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      const [v, t, eu] = await Promise.all([
        supabase
          .from("veiculos")
          .select("id, placa, modelo, status")
          .in("status", ["ATIVO", "BLOQUEADO", "MANUTENCAO"])
          .order("placa"),
        supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
        user
          ? supabase.from("tecnicos").select("id, nome, papel").eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setVeiculos((v.data as Veiculo[]) ?? []);
      setTecnicos((t.data as Tecnico[]) ?? []);

      const meu = eu.data as { id?: string; nome?: string; papel?: string } | null;
      setEuId(meu?.id ?? null);
      setEuNome(meu?.nome ?? null);
      setEhGestor(meu?.papel === "GESTOR");
      // O relato sai no nome de quem esta logado: e o que a RLS permite gravar.
      setTecnicoId(meu?.id ?? "");
      setCarregando(false);
    })();
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!tecnicoId) {
      setErro("Seu login ainda não está vinculado a um técnico. Fale com o gestor.");
      return;
    }
    if (!veiculoId || !tipo || !gravidade || !descricao.trim()) {
      setErro("Preencha veículo, tipo, gravidade e a descrição do que aconteceu.");
      return;
    }
    if (!fotos || fotos.length === 0) {
      setErro("A foto é obrigatória. Fotografe o dano antes de enviar.");
      return;
    }
    if (data > hoje) {
      setErro("A data da ocorrência não pode ser no futuro.");
      return;
    }

    setSalvando(true);
    try {
      const supabase = createClient();

      const urls: string[] = [];
      for (let i = 0; i < fotos.length; i++) {
        const f = fotos[i];
        const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${veiculoId}/ocorrencia-${Date.now()}-${i}.${ext}`;
        const up = await supabase.storage.from("ocorrencias").upload(path, f);
        if (up.error) throw up.error;
        urls.push(supabase.storage.from("ocorrencias").getPublicUrl(path).data.publicUrl);
      }

      const { error } = await supabase.from("ocorrencias").insert({
        veiculo_id: veiculoId,
        tecnico_id: tecnicoId,
        tipo,
        data,
        local: local.trim() || null,
        descricao: descricao.trim(),
        gravidade,
        terceiros,
        fotos: urls,
        status: "ABERTA",
      });
      if (error) throw error;
      setOk(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao registrar a ocorrência.");
    } finally {
      setSalvando(false);
    }
  }

  const input: React.CSSProperties = {
    width: "100%", marginTop: 6, marginBottom: 16, padding: "11px 12px",
    borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 15, boxSizing: "border-box", background: "#fff",
  };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#101A26" };
  const secao: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em",
    color: "#C0392B", margin: "20px 0 10px", borderTop: "1px solid #E3E9F0", paddingTop: 16,
  };

  if (ok) {
    return (
      <main style={{ minHeight: "100vh", background: "#F4F6F9", padding: 20 }}>
        <div style={{ maxWidth: 520, margin: "0 auto", background: "#fff", border: "1px solid #E3E9F0", borderRadius: 14, padding: 24 }}>
          <div style={{ background: "#E7F3EE", color: "#1B7A4B", borderRadius: 10, padding: 16, fontSize: 14, marginBottom: 16 }}>
            Ocorrência registrada! O gestor já consegue ver o relato e as fotos.
          </div>
          {gravidade === "GRAVE" && (
            <div style={{ background: "#FBEAE7", color: "#A5301F", borderRadius: 10, padding: 16, fontSize: 14, marginBottom: 16 }}>
              Ocorrência <strong>grave</strong>: não use o veículo antes de falar com o gestor.
            </div>
          )}
          <a href="/campo" style={{ display: "block", textAlign: "center", padding: "11px", borderRadius: 8, background: "#2B4C8C", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none", marginBottom: 10 }}>
            Voltar ao início
          </a>
          <button
            onClick={() => {
              setOk(false); setVeiculoId(""); setTipo(""); setGravidade("");
              setLocal(""); setDescricao(""); setTerceiros(false); setFotos(null); setData(hoje);
            }}
            style={{ width: "100%", padding: "11px", borderRadius: 8, border: "1px solid #CBD5E1", background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Relatar outra ocorrência
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F4F6F9", padding: 20 }}>
      <div style={{ maxWidth: 520, margin: "0 auto", background: "#fff", border: "1px solid #E3E9F0", borderRadius: 14, padding: 24, boxShadow: "0 8px 30px rgba(16,26,38,.06)" }}>
        <a href="/campo" style={{ fontSize: 13, color: "#2B4C8C", textDecoration: "none" }}>← Voltar</a>
        <h1 style={{ margin: "10px 0 2px", fontSize: 22 }}>Relatar ocorrência</h1>
        <p style={{ color: "#6B7A8D", fontSize: 14, marginBottom: 20 }}>
          Bateu, riscou, quebrou ou apareceu um defeito? Registre aqui com foto.
        </p>

        {carregando ? (
          <p style={{ color: "#6B7A8D", fontSize: 14 }}>Carregando…</p>
        ) : (
          <form onSubmit={salvar}>
            <div style={secao}>1. O que aconteceu</div>

            <label style={label}>Veículo</label>
            <select required value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)} style={input}>
              <option value="">Selecione…</option>
              {veiculos.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.modelo} — {v.placa}
                  {v.status === "BLOQUEADO" ? " 🔴 (bloqueado)" : v.status === "MANUTENCAO" ? " 🔧 (manutenção)" : ""}
                </option>
              ))}
            </select>

            <label style={label}>Quem está relatando</label>
            {ehGestor ? (
              <select required value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)} style={input}>
                <option value="">Selecione…</option>
                {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            ) : (
              <div style={{ ...input, background: "#F4F6F9", color: euId ? "#101A26" : "#C0392B" }}>
                {euId ? euNome : "Login sem técnico vinculado — fale com o gestor"}
              </div>
            )}

            <label style={label}>Tipo</label>
            <select required value={tipo} onChange={(e) => setTipo(e.target.value)} style={input}>
              <option value="">Selecione…</option>
              {TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>

            <label style={label}>Quando aconteceu</label>
            <input type="date" required max={hoje} value={data} onChange={(e) => setData(e.target.value)} style={input} />

            <label style={label}>Onde aconteceu (opcional)</label>
            <input type="text" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="ex.: estacionamento do cliente, Av. Brasil" style={input} />

            <div style={secao}>2. Gravidade</div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, marginBottom: 16 }}>
              {GRAVIDADES.map(([v, txt, cor]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setGravidade(v)}
                  style={{
                    flex: 1, padding: "11px 4px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
                    border: gravidade === v ? `2px solid ${cor}` : "1px solid #CBD5E1",
                    background: gravidade === v ? cor + "18" : "#fff",
                    color: gravidade === v ? cor : "#101A26",
                  }}
                >
                  {txt}
                </button>
              ))}
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 14, fontWeight: 600, color: "#101A26" }}>
              <input type="checkbox" checked={terceiros} onChange={(e) => setTerceiros(e.target.checked)} />
              Envolveu outro veículo ou outra pessoa
            </label>

            <label style={label}>Descreva o que aconteceu</label>
            <textarea
              required
              rows={4}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="conte como foi, o que danificou e se alguém se machucou"
              style={{ ...input, fontFamily: "inherit", resize: "vertical" }}
            />

            <div style={secao}>3. Fotos (obrigatório)</div>
            <label style={label}>Fotografe o dano de perto e de longe.</label>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              required
              onChange={(e) => setFotos(e.target.files)}
              style={{ ...input, padding: 8 }}
            />

            <button
              type="submit"
              disabled={salvando}
              style={{ width: "100%", padding: "13px", borderRadius: 8, border: "none", background: salvando ? "#D89A90" : "#C0392B", color: "#fff", fontSize: 15, fontWeight: 600, cursor: salvando ? "default" : "pointer", marginTop: 8 }}
            >
              {salvando ? "Enviando…" : "Registrar ocorrência"}
            </button>

            {erro && <div style={{ color: "#C0392B", fontSize: 13, marginTop: 12 }}>{erro}</div>}
          </form>
        )}
      </div>
    </main>
  );
}
