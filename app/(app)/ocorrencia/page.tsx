"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
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
  Checkbox,
  Input,
  Pagina,
  Select,
  Textarea,
  cx,
} from "@/components/ui";

type Veiculo = { id: string; placa: string; modelo: string; status: string };
type Tecnico = { id: string; nome: string };

const TIPOS: [string, string][] = [
  ["DANO", "Dano no veículo (bati, riscou, quebrou)"],
  ["ACIDENTE", "Acidente (colisão, envolveu outro veículo)"],
  ["AVARIA", "Avaria / defeito que apareceu"],
  ["OUTRO", "Outro"],
];

/** A cor da gravidade é a mesma dos tons do kit — verde, âmbar, vermelho. */
const GRAVIDADES: [string, string, string, string][] = [
  ["LEVE", "Leve", "ring-emerald-600 bg-emerald-50 text-emerald-700", "text-emerald-700"],
  ["MODERADA", "Moderada", "ring-amber-500 bg-amber-50 text-amber-700", "text-amber-700"],
  ["GRAVE", "Grave", "ring-red-600 bg-red-50 text-red-700", "text-red-700"],
];

export default function OcorrenciaPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [euId, setEuId] = useState<string | null>(null);
  const [euNome, setEuNome] = useState<string | null>(null);
  const [ehGestor, setEhGestor] = useState(false);
  const [carregando, setCarregando] = useState(true);

  const hoje = hojeBR();

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
      const {
        data: { user },
      } = await supabase.auth.getUser();

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
      const urls = await enviarFotos(supabase, "ocorrencias", `${veiculoId}/ocorrencia`, fotos);

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

  if (ok) {
    return (
      <Pagina estreita titulo="Ocorrência registrada">
        <Cartao className="p-5">
          <div className="mb-3 flex items-start gap-2.5 rounded-lg bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
            <CheckCircle2 size={18} className="mt-px shrink-0" />
            <span>
              <b>Relato enviado.</b> O gestor já consegue ver a descrição e as fotos.
            </span>
          </div>
          {gravidade === "GRAVE" && (
            <div className="mb-3 flex items-start gap-2.5 rounded-lg bg-red-50 px-3.5 py-3 text-sm text-red-800 ring-1 ring-inset ring-red-200">
              <AlertTriangle size={18} className="mt-px shrink-0" />
              <span>
                Ocorrência <b>grave</b>: não use o veículo antes de falar com o gestor.
              </span>
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <BotaoLink href="/campo" variante="primario" tamanho="lg" className="flex-1">
              Voltar ao início
            </BotaoLink>
            <Botao
              tamanho="lg"
              className="flex-1"
              onClick={() => {
                setOk(false);
                setVeiculoId("");
                setTipo("");
                setGravidade("");
                setLocal("");
                setDescricao("");
                setTerceiros(false);
                setFotos(null);
                setData(hoje);
              }}
            >
              Relatar outra ocorrência
            </Botao>
          </div>
        </Cartao>
      </Pagina>
    );
  }

  return (
    <Pagina
      estreita
      titulo="Relatar ocorrência"
      subtitulo="Bateu, riscou, quebrou ou apareceu um defeito? Registre aqui, com foto."
    >
      {carregando ? (
        <Cartao>
          <Carregando />
        </Cartao>
      ) : (
        <form onSubmit={salvar} className="space-y-3">
          <Cartao titulo="1 · O que aconteceu">
            <div className="space-y-3.5 p-4">
              <Campo rotulo="Veículo">
                <Select required value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {veiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.modelo} — {v.placa}
                      {v.status === "BLOQUEADO"
                        ? " (bloqueado)"
                        : v.status === "MANUTENCAO"
                          ? " (em manutenção)"
                          : ""}
                    </option>
                  ))}
                </Select>
              </Campo>

              <Campo rotulo="Quem está relatando">
                {ehGestor ? (
                  <Select required value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
                    <option value="">Selecione…</option>
                    {tecnicos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <div
                    className={cx(
                      "campo bg-slate-100",
                      euId ? "text-slate-800" : "font-medium text-red-700",
                    )}
                  >
                    {euId ? euNome : "Login sem técnico vinculado — fale com o gestor"}
                  </div>
                )}
              </Campo>

              <Campo rotulo="Tipo">
                <Select required value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="">Selecione…</option>
                  {TIPOS.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Campo>

              <Campo rotulo="Quando aconteceu">
                <Input
                  type="date"
                  required
                  max={hoje}
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </Campo>

              <Campo rotulo="Onde aconteceu (opcional)">
                <Input
                  type="text"
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                  placeholder="ex.: estacionamento do cliente, Av. Brasil"
                />
              </Campo>
            </div>
          </Cartao>

          <Cartao titulo="2 · Gravidade">
            <div className="space-y-3.5 p-4">
              <div className="flex gap-2">
                {GRAVIDADES.map(([v, txt, ativo]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setGravidade(v)}
                    className={cx(
                      "toque flex-1 rounded-lg text-sm font-semibold ring-1 ring-inset transition",
                      gravidade === v
                        ? `ring-2 ${ativo}`
                        : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50",
                    )}
                  >
                    {txt}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-2 text-[13.5px] font-medium text-slate-700">
                <Checkbox checked={terceiros} onChange={(e) => setTerceiros(e.target.checked)} />
                Envolveu outro veículo ou outra pessoa
              </label>

              <Campo rotulo="Descreva o que aconteceu">
                <Textarea
                  required
                  rows={4}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="conte como foi, o que danificou e se alguém se machucou"
                  className="resize-y"
                />
              </Campo>
            </div>
          </Cartao>

          <Cartao titulo="3 · Fotos (obrigatórias)">
            <div className="p-4">
              <Campo rotulo="Fotografe o dano de perto e de longe">
                <Input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  required
                  onChange={(e) => setFotos(e.target.files)}
                  className="file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-700"
                />
              </Campo>
            </div>
          </Cartao>

          <Botao
            type="submit"
            variante="primario"
            tamanho="lg"
            disabled={salvando}
            className="w-full"
          >
            {salvando ? "Enviando…" : "Registrar ocorrência"}
          </Botao>

          {erro && <Aviso>{erro}</Aviso>}
        </form>
      )}
    </Pagina>
  );
}
