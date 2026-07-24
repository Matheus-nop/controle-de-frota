"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Veiculo = { id: string; placa: string; modelo: string };
type Tecnico = { id: string; nome: string };

const ITENS_RAPIDO: [string, string][] = [
  ["pneus", "Pneus em boas condições?"],
  ["farois", "Faróis funcionando?"],
  ["lanternas", "Lanternas funcionando?"],
  ["setas", "Setas funcionando?"],
  ["luz_freio", "Luz de freio funcionando?"],
  ["vidros", "Vidros funcionando?"],
  ["travas", "Travas funcionando?"],
  ["ar", "Ar condicionado funcionando?"],
  ["retrovisores", "Retrovisores em bom estado?"],
  ["luz_painel", "Painel apresenta alguma luz de alerta?"],
  ["barulho", "Veículo apresenta barulho ou comportamento estranho?"],
];

const AVARIA_ONDE = ["FRENTE", "TRASEIRA", "LATERAL DIREITA", "LATERAL ESQUERDA", "INTERIOR", "RODAS/PNEUS", "OUTRO"];
const AVARIA_TIPO = ["AMASSADO", "ARRANHÃO", "QUEBRA", "LANTERNA/FAROL", "PNEU", "RETROVISOR", "OUTRO"];
const AVARIA_EXISTIA = ["NÃO, É NOVA", "SIM, JÁ EXISTIA", "NÃO SEI INFORMAR"];
const MOTIVOS = ["PNEU", "FREIO", "MOTOR", "ELÉTRICA", "LUZ DE PAINEL", "BARULHO", "VIDRO", "AR CONDICIONADO", "AVARIA GRAVE", "DOCUMENTO", "OUTROS"];
const URGENCIAS = ["BAIXA", "MÉDIA", "ALTA", "EMERGENCIAL"];

export default function ChecklistPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [condutorId, setCondutorId] = useState("");
  const [data, setData] = useState("");
  const [veiculoId, setVeiculoId] = useState("");
  const [km, setKm] = useState("");
  const [usadoOutro, setUsadoOutro] = useState("");

  const [rapido, setRapido] = useState<Record<string, string>>({});

  const [novaAvaria, setNovaAvaria] = useState("");
  const [avOnde, setAvOnde] = useState("");
  const [avTipo, setAvTipo] = useState("");
  const [avExistia, setAvExistia] = useState("");
  const [avDesc, setAvDesc] = useState("");
  const [fotoAvaria, setFotoAvaria] = useState<FileList | null>(null);

  const [apto, setApto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [motivoDesc, setMotivoDesc] = useState("");
  const [urgencia, setUrgencia] = useState("");
  const [fotoBloqueio, setFotoBloqueio] = useState<FileList | null>(null);

  const [fotosSemanais, setFotosSemanais] = useState<FileList | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const [v, t] = await Promise.all([
        supabase.from("veiculos").select("id, placa, modelo").eq("status", "ATIVO").order("placa"),
        supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
      ]);
      setVeiculos((v.data as Veiculo[]) ?? []);
      setTecnicos((t.data as Tecnico[]) ?? []);
      setCarregando(false);
    })();
  }, []);

  async function uploadFotos(files: FileList | null, prefixo: string): Promise<string[]> {
    if (!files || files.length === 0) return [];
    const supabase = createClient();
    const urls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${veiculoId}/${prefixo}-${Date.now()}-${i}.${ext}`;
      const up = await supabase.storage.from("checklists").upload(path, f, { upsert: false });
      if (up.error) throw up.error;
      urls.push(supabase.storage.from("checklists").getPublicUrl(path).data.publicUrl);
    }
    return urls;
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!condutorId || !veiculoId || !km || !apto) {
      setErro("Preencha condutor, veículo, km e se o veículo está apto.");
      return;
    }
    if (!fotosSemanais || fotosSemanais.length === 0) {
      setErro("As fotos semanais (frente, traseira e laterais) são obrigatórias.");
      return;
    }
    if (apto === "NÃO" && (!motivo || (!fotoBloqueio || fotoBloqueio.length === 0))) {
      setErro("Veículo não apto: informe o motivo do bloqueio e a foto obrigatória.");
      return;
    }

    setSalvando(true);
    try {
      const [fSemanais, fAvaria, fBloqueio] = await Promise.all([
        uploadFotos(fotosSemanais, "semanal"),
        uploadFotos(novaAvaria === "SIM" ? fotoAvaria : null, "avaria"),
        uploadFotos(apto === "NÃO" ? fotoBloqueio : null, "bloqueio"),
      ]);

      const itens = {
        usado_por_outro: usadoOutro || null,
        checklist: rapido,
        nova_avaria: novaAvaria,
        avaria:
          novaAvaria === "SIM"
            ? { onde: avOnde, tipo: avTipo, ja_existia: avExistia, descricao: avDesc, fotos: fAvaria }
            : null,
        fotos_semanais: fSemanais,
        fotos_bloqueio: fBloqueio,
      };

      const supabase = createClient();
      const { error } = await supabase.from("checklists").insert({
        veiculo_id: veiculoId,
        tecnico_id: condutorId,
        data: data || new Date().toISOString().slice(0, 10),
        km_atual: parseInt(km, 10),
        itens,
        apto: apto === "SIM",
        motivo_bloqueio: apto === "NÃO" ? motivo : null,
        descricao: apto === "NÃO" ? motivoDesc.trim() || null : null,
        urgencia: apto === "NÃO" ? urgencia || null : null,
        foto_url: fSemanais[0] ?? null,
      });
      if (error) throw error;
      setOk(true);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar o checklist.");
    } finally {
      setSalvando(false);
    }
  }

  const input: React.CSSProperties = {
    width: "100%", marginTop: 6, marginBottom: 16, padding: "11px 12px",
    borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 15, boxSizing: "border-box", background: "#fff",
  };
  const label: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#101A26" };
  const secao: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "#1F6FEB", margin: "20px 0 10px", borderTop: "1px solid #E3E9F0", paddingTop: 16 };

  function SimNao({ valor, set }: { valor: string; set: (v: string) => void }) {
    return (
      <div style={{ display: "flex", gap: 8, marginTop: 6, marginBottom: 14 }}>
        {["SIM", "NÃO"].map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => set(op)}
            style={{
              flex: 1, padding: "9px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
              border: valor === op ? "2px solid #1F6FEB" : "1px solid #CBD5E1",
              background: valor === op ? "#EAF1FE" : "#fff", color: valor === op ? "#1F6FEB" : "#101A26",
            }}
          >
            {op}
          </button>
        ))}
      </div>
    );
  }

  if (ok) {
    return (
      <main style={{ minHeight: "100vh", background: "#F4F6F9", padding: 20 }}>
        <div style={{ maxWidth: 520, margin: "0 auto", background: "#fff", border: "1px solid #E3E9F0", borderRadius: 14, padding: 24 }}>
          <div style={{ background: "#E7F3EE", color: "#1B7A4B", borderRadius: 10, padding: 16, fontSize: 14, marginBottom: 16 }}>
            Checklist registrado! {apto === "NÃO" ? "Veículo marcado como NÃO APTO." : "Veículo apto."}
          </div>
          <a href="/" style={{ display: "block", textAlign: "center", padding: "11px", borderRadius: 8, background: "#1F6FEB", color: "#fff", fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
            Ir para o painel
          </a>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F4F6F9", padding: 20 }}>
      <div style={{ maxWidth: 520, margin: "0 auto", background: "#fff", border: "1px solid #E3E9F0", borderRadius: 14, padding: 24, boxShadow: "0 8px 30px rgba(16,26,38,.06)" }}>
        <a href="/" style={{ fontSize: 13, color: "#1F6FEB", textDecoration: "none" }}>← Voltar ao painel</a>
        <h1 style={{ margin: "10px 0 2px", fontSize: 22 }}>Checklist veicular — semanal</h1>

        {carregando ? (
          <p style={{ color: "#6B7A8D", fontSize: 14 }}>Carregando…</p>
        ) : (
          <form onSubmit={salvar}>
            <div style={secao}>1. Identificação</div>

            <label style={label}>Nome do condutor</label>
            <select required value={condutorId} onChange={(e) => setCondutorId(e.target.value)} style={input}>
              <option value="">Selecione…</option>
              {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>

            <label style={label}>Data da vistoria</label>
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={input} />

            <label style={label}>Modelo e placa do veículo</label>
            <select required value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)} style={input}>
              <option value="">Selecione…</option>
              {veiculos.map((v) => <option key={v.id} value={v.id}>{v.modelo} — {v.placa}</option>)}
            </select>

            <label style={label}>Km atual</label>
            <input type="number" inputMode="numeric" required value={km} onChange={(e) => setKm(e.target.value)} style={input} />

            <label style={label}>O veículo foi utilizado por outro condutor antes desta vistoria?</label>
            <select value={usadoOutro} onChange={(e) => setUsadoOutro(e.target.value)} style={input}>
              <option value="">Selecione…</option>
              {["SIM", "NÃO", "NÃO SEI INFORMAR"].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>

            <div style={secao}>2. Checklist rápido</div>
            {ITENS_RAPIDO.map(([key, texto]) => (
              <div key={key}>
                <label style={label}>{texto}</label>
                <SimNao valor={rapido[key] ?? ""} set={(v) => setRapido((p) => ({ ...p, [key]: v }))} />
              </div>
            ))}

            <div style={secao}>3. Avaria visual</div>
            <label style={label}>O veículo apresenta alguma nova avaria?</label>
            <SimNao valor={novaAvaria} set={setNovaAvaria} />

            {novaAvaria === "SIM" && (
              <>
                <div style={secao}>4. Detalhamento da avaria</div>
                <label style={label}>Onde?</label>
                <select value={avOnde} onChange={(e) => setAvOnde(e.target.value)} style={input}>
                  <option value="">Selecione…</option>
                  {AVARIA_ONDE.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <label style={label}>Tipo de avaria?</label>
                <select value={avTipo} onChange={(e) => setAvTipo(e.target.value)} style={input}>
                  <option value="">Selecione…</option>
                  {AVARIA_TIPO.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <label style={label}>A avaria já existia?</label>
                <select value={avExistia} onChange={(e) => setAvExistia(e.target.value)} style={input}>
                  <option value="">Selecione…</option>
                  {AVARIA_EXISTIA.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <label style={label}>Descreva rapidamente</label>
                <input type="text" value={avDesc} onChange={(e) => setAvDesc(e.target.value)} style={input} />
                <label style={label}>Foto da avaria</label>
                <input type="file" accept="image/*" multiple onChange={(e) => setFotoAvaria(e.target.files)} style={{ ...input, padding: 8 }} />
              </>
            )}

            <div style={secao}>5. Finalização</div>
            <label style={label}>Veículo apto para operação?</label>
            <SimNao valor={apto} set={setApto} />

            {apto === "NÃO" && (
              <>
                <div style={secao}>6. Veículo não apto</div>
                <label style={label}>Motivo do bloqueio</label>
                <select value={motivo} onChange={(e) => setMotivo(e.target.value)} style={input}>
                  <option value="">Selecione…</option>
                  {MOTIVOS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <label style={label}>Descreva o motivo</label>
                <input type="text" value={motivoDesc} onChange={(e) => setMotivoDesc(e.target.value)} style={input} />
                <label style={label}>Grau de urgência</label>
                <select value={urgencia} onChange={(e) => setUrgencia(e.target.value)} style={input}>
                  <option value="">Selecione…</option>
                  {URGENCIAS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                <label style={label}>Foto obrigatória</label>
                <input type="file" accept="image/*" multiple onChange={(e) => setFotoBloqueio(e.target.files)} style={{ ...input, padding: 8 }} />
              </>
            )}

            <div style={secao}>7. Fotos semanais obrigatórias</div>
            <label style={label}>Envie fotos da frente, traseira e laterais do veículo.</label>
            <input type="file" accept="image/*" multiple required onChange={(e) => setFotosSemanais(e.target.files)} style={{ ...input, padding: 8 }} />

            <button type="submit" disabled={salvando} style={{ width: "100%", padding: "13px", borderRadius: 8, border: "none", background: salvando ? "#7CA0C9" : "#1F6FEB", color: "#fff", fontSize: 15, fontWeight: 600, cursor: salvando ? "default" : "pointer", marginTop: 8 }}>
              {salvando ? "Enviando…" : "Enviar checklist"}
            </button>

            {erro && <div style={{ color: "#C0392B", fontSize: 13, marginTop: 12 }}>{erro}</div>}
          </form>
        )}
      </div>
    </main>
  );
}
