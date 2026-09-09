"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hojeBR } from "@/lib/frota/tempo";
import { enviarFotos } from "@/lib/frota/foto";
import {
  Aviso,
  Botao,
  BotaoLink,
  Campo,
  Cartao,
  Carregando,
  Input,
  Pagina,
  Select,
  cx,
} from "@/components/ui";

type Veiculo = { id: string; placa: string; modelo: string; status: string };
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

/** Estilo comum dos campos de arquivo: o botão nativo destoa do resto. */
const CAMPO_ARQUIVO =
  "file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-700";

/**
 * Sim/Não em dois alvos grandes, no lugar de um `select`. São onze perguntas
 * seguidas: abrir uma lista suspensa em cada uma, de pé ao lado do veículo, é
 * o que fazia a equipe desistir do formulário no meio.
 *
 * Fica fora do componente da página de propósito: definido dentro, o React o
 * remontaria a cada tecla digitada em qualquer outro campo.
 */
function SimNao({ valor, onEscolher }: { valor: string; onEscolher(v: string): void }) {
  return (
    <div className="mt-1.5 flex gap-2">
      {["SIM", "NÃO"].map((op) => (
        <button
          key={op}
          type="button"
          onClick={() => onEscolher(op)}
          className={cx(
            "toque flex-1 rounded-lg text-sm font-semibold ring-1 ring-inset transition",
            valor === op
              ? "bg-brand-50 text-brand-700 ring-2 ring-brand-600"
              : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
          )}
        >
          {op}
        </button>
      ))}
    </div>
  );
}

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
      await supabase.auth.getUser();
      const [v, t] = await Promise.all([
        supabase
          .from("veiculos")
          .select("id, placa, modelo, status")
          .in("status", ["ATIVO", "BLOQUEADO"])
          .order("placa"),
        supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
      ]);
      setVeiculos((v.data as Veiculo[]) ?? []);
      setTecnicos((t.data as Tecnico[]) ?? []);
      setCarregando(false);
    })();
  }, []);

  const respondidas = ITENS_RAPIDO.filter(([k]) => rapido[k]).length;

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
    if (apto === "NÃO" && (!motivo || !fotoBloqueio || fotoBloqueio.length === 0)) {
      setErro("Veículo não apto: informe o motivo do bloqueio e a foto obrigatória.");
      return;
    }

    setSalvando(true);
    try {
      const supabase = createClient();
      const [fSemanais, fAvaria, fBloqueio] = await Promise.all([
        enviarFotos(supabase, "checklists", `${veiculoId}/semanal`, fotosSemanais),
        enviarFotos(supabase, "checklists", `${veiculoId}/avaria`, novaAvaria === "SIM" ? fotoAvaria : null),
        enviarFotos(supabase, "checklists", `${veiculoId}/bloqueio`, apto === "NÃO" ? fotoBloqueio : null),
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

      const { error } = await supabase.from("checklists").insert({
        veiculo_id: veiculoId,
        tecnico_id: condutorId,
        data: data || hojeBR(),
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

  if (ok) {
    return (
      <Pagina estreita titulo="Checklist enviado">
        <Cartao className="p-5">
          <div
            className={cx(
              "mb-4 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm ring-1 ring-inset",
              apto === "NÃO"
                ? "bg-red-50 text-red-800 ring-red-200"
                : "bg-emerald-50 text-emerald-800 ring-emerald-200",
            )}
          >
            <CheckCircle2 size={18} className="mt-px shrink-0" />
            <span>
              <b>Checklist registrado.</b>{" "}
              {apto === "NÃO"
                ? "O veículo ficou marcado como NÃO APTO e está bloqueado até o reparo."
                : "Veículo apto para operação."}
            </span>
          </div>
          <BotaoLink href="/campo" variante="primario" tamanho="lg" className="w-full">
            Voltar ao início
          </BotaoLink>
        </Cartao>
      </Pagina>
    );
  }

  return (
    <Pagina
      estreita
      titulo="Checklist veicular"
      subtitulo="Vistoria semanal do veículo. As fotos da volta completa são obrigatórias."
    >
      {carregando ? (
        <Cartao>
          <Carregando />
        </Cartao>
      ) : (
        <form onSubmit={salvar} className="space-y-3">
          <Cartao titulo="1 · Identificação">
            <div className="space-y-3.5 p-4">
              <Campo rotulo="Nome do condutor">
                <Select required value={condutorId} onChange={(e) => setCondutorId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {tecnicos.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </Select>
              </Campo>

              <Campo rotulo="Data da vistoria" dica="Em branco, vale hoje.">
                <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </Campo>

              <Campo rotulo="Modelo e placa do veículo">
                <Select required value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {veiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.modelo} — {v.placa}
                      {v.status === "BLOQUEADO" ? " (bloqueado)" : ""}
                    </option>
                  ))}
                </Select>
              </Campo>

              <Campo rotulo="Km atual">
                <Input
                  type="number"
                  inputMode="numeric"
                  required
                  value={km}
                  onChange={(e) => setKm(e.target.value)}
                  placeholder="ex.: 66402"
                />
              </Campo>

              <Campo rotulo="O veículo foi usado por outro condutor antes desta vistoria?">
                <Select value={usadoOutro} onChange={(e) => setUsadoOutro(e.target.value)}>
                  <option value="">Selecione…</option>
                  {["SIM", "NÃO", "NÃO SEI INFORMAR"].map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </Campo>
            </div>
          </Cartao>

          <Cartao
            titulo="2 · Checklist rápido"
            acoes={
              <span className="text-[12px] font-normal tabular-nums text-slate-500">
                {respondidas} de {ITENS_RAPIDO.length}
              </span>
            }
          >
            <div className="divide-y divide-slate-100">
              {ITENS_RAPIDO.map(([chave, texto]) => (
                <div key={chave} className="px-4 py-3">
                  <span className="text-[13.5px] font-medium text-slate-700">{texto}</span>
                  <SimNao
                    valor={rapido[chave] ?? ""}
                    onEscolher={(v) => setRapido((p) => ({ ...p, [chave]: v }))}
                  />
                </div>
              ))}
            </div>
          </Cartao>

          <Cartao titulo="3 · Avaria visual">
            <div className="space-y-3.5 p-4">
              <div>
                <span className="text-[13.5px] font-medium text-slate-700">
                  O veículo apresenta alguma nova avaria?
                </span>
                <SimNao valor={novaAvaria} onEscolher={setNovaAvaria} />
              </div>

              {novaAvaria === "SIM" && (
                <div className="space-y-3.5 rounded-lg bg-amber-50/60 p-3.5 ring-1 ring-inset ring-amber-200">
                  <Campo rotulo="Onde?">
                    <Select value={avOnde} onChange={(e) => setAvOnde(e.target.value)}>
                      <option value="">Selecione…</option>
                      {AVARIA_ONDE.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                  <Campo rotulo="Tipo de avaria">
                    <Select value={avTipo} onChange={(e) => setAvTipo(e.target.value)}>
                      <option value="">Selecione…</option>
                      {AVARIA_TIPO.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                  <Campo rotulo="A avaria já existia?">
                    <Select value={avExistia} onChange={(e) => setAvExistia(e.target.value)}>
                      <option value="">Selecione…</option>
                      {AVARIA_EXISTIA.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                  <Campo rotulo="Descreva rapidamente">
                    <Input type="text" value={avDesc} onChange={(e) => setAvDesc(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Foto da avaria">
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => setFotoAvaria(e.target.files)}
                      className={CAMPO_ARQUIVO}
                    />
                  </Campo>
                </div>
              )}
            </div>
          </Cartao>

          <Cartao titulo="4 · Finalização">
            <div className="space-y-3.5 p-4">
              <div>
                <span className="text-[13.5px] font-medium text-slate-700">
                  Veículo apto para operação?
                </span>
                <SimNao valor={apto} onEscolher={setApto} />
              </div>

              {apto === "NÃO" && (
                <div className="space-y-3.5 rounded-lg bg-red-50/60 p-3.5 ring-1 ring-inset ring-red-200">
                  <p className="text-[12.5px] leading-relaxed text-red-800">
                    Marcar &ldquo;não apto&rdquo; <b>bloqueia o veículo na hora</b>. Ele só volta a
                    aparecer para saída quando um novo checklist disser que está apto.
                  </p>
                  <Campo rotulo="Motivo do bloqueio">
                    <Select value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                      <option value="">Selecione…</option>
                      {MOTIVOS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                  <Campo rotulo="Descreva o motivo">
                    <Input type="text" value={motivoDesc} onChange={(e) => setMotivoDesc(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Grau de urgência">
                    <Select value={urgencia} onChange={(e) => setUrgencia(e.target.value)}>
                      <option value="">Selecione…</option>
                      {URGENCIAS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                  <Campo rotulo="Foto obrigatória">
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => setFotoBloqueio(e.target.files)}
                      className={CAMPO_ARQUIVO}
                    />
                  </Campo>
                </div>
              )}
            </div>
          </Cartao>

          <Cartao titulo="5 · Fotos semanais (obrigatórias)">
            <div className="p-4">
              <Campo rotulo="Frente, traseira e as duas laterais do veículo">
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  required
                  onChange={(e) => setFotosSemanais(e.target.files)}
                  className={CAMPO_ARQUIVO}
                />
              </Campo>
            </div>
          </Cartao>

          <Botao type="submit" variante="primario" tamanho="lg" disabled={salvando} className="w-full">
            {salvando ? "Enviando…" : "Enviar checklist"}
          </Botao>

          {erro && <Aviso>{erro}</Aviso>}
        </form>
      )}
    </Pagina>
  );
}
