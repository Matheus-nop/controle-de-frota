"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { paraInteiro } from "@/lib/frota/numero";
import { diaHoraDe } from "@/lib/frota/tempo";
import { enviarFoto } from "@/lib/frota/foto";
import {
  Aviso,
  Botao,
  BotaoLink,
  Campo,
  CampoNumero,
  Cartao,
  Carregando,
  Checkbox,
  Input,
  Pagina,
  Select,
  Vazio,
} from "@/components/ui";

type Aberto = {
  id: string;
  km_saida: number;
  saida_em: string;
  tecnico_saida_id: string;
  veiculo: { placa: string; modelo: string } | { placa: string; modelo: string }[] | null;
  tecnico: { nome: string } | { nome: string }[] | null;
};
type Tecnico = { id: string; nome: string };

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

// Duas faixas, e elas fazem coisas diferentes de proposito.
//
// KM_AVISO: acima disso e incomum, mas acontece — Minas, litoral, uma entrega
// que virou o dia. Nao barra: pede que o tecnico confirme e diga para onde foi.
// O roteiro nasce marcado como "km alto verificar" na coluna Pendencias do
// painel, e o gestor confere depois. (O mesmo 600 esta na view v_roteiros.)
//
// KM_ABSURDO: acima disso nao e viagem, e digitacao — o hodometro inteiro no
// lugar do km, um zero a mais. Barra aqui com uma mensagem que explica, em vez
// de deixar o banco recusar com "violates check constraint". Mesmo teto da
// constraint km_plausivel (migration 0010).
const KM_AVISO = 600;
const KM_ABSURDO = 5000;

const nf = (n: number) => n.toLocaleString("pt-BR");

export default function RegistrarChegadaPage() {
  const [abertos, setAbertos] = useState<Aberto[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [roteiroId, setRoteiroId] = useState("");
  const [km, setKm] = useState("");
  const [tecnicoChegadaId, setTecnicoChegadaId] = useState("");
  const [obs, setObs] = useState("");
  const [pendencia, setPendencia] = useState(false);
  const [descPend, setDescPend] = useState("");
  const [confirmaLongo, setConfirmaLongo] = useState(false);
  const [motivoLongo, setMotivoLongo] = useState("");
  const [foto, setFoto] = useState<FileList | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.getUser();
    const [r, t] = await Promise.all([
      supabase
        .from("roteiros")
        .select(
          "id, km_saida, saida_em, tecnico_saida_id, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_saida_id(nome)",
        )
        .is("chegada_em", null)
        .order("saida_em"),
      supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
    ]);
    setAbertos((r.data as Aberto[]) ?? []);
    setTecnicos((t.data as Tecnico[]) ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, [carregar]);

  const sel = abertos.find((x) => x.id === roteiroId);

  // Quanto o roteiro rodou, conforme o tecnico digita. Null enquanto nao da
  // para saber (sem roteiro escolhido ou campo vazio).
  const kmDigitado = paraInteiro(km);
  const rodado =
    sel && kmDigitado != null && kmDigitado >= sel.km_saida ? kmDigitado - sel.km_saida : null;
  const kmAlto = rodado != null && rodado > KM_AVISO && rodado <= KM_ABSURDO;
  const kmAbsurdo = rodado != null && rodado > KM_ABSURDO;

  function selecionar(id: string) {
    setRoteiroId(id);
    setErro(null);
    setConfirmaLongo(false);
    setMotivoLongo("");
    const r = abertos.find((x) => x.id === id);
    setTecnicoChegadaId(r?.tecnico_saida_id ?? "");
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!sel) {
      setErro("Selecione um roteiro aberto.");
      return;
    }
    const kmNum = paraInteiro(km);
    if (kmNum == null) {
      setErro("Informe o km de chegada.");
      return;
    }
    if (kmNum < sel.km_saida) {
      setErro(`Km de chegada (${nf(kmNum)}) menor que o de saída (${nf(sel.km_saida)}).`);
      return;
    }
    const rodado = kmNum - sel.km_saida;
    if (rodado > KM_ABSURDO) {
      setErro(
        `Diferença de ${nf(rodado)} km. Isso não é uma viagem, é o hodômetro digitado errado — ` +
          `confira o número no painel do veículo e digite de novo.`,
      );
      return;
    }
    if (rodado > KM_AVISO && !confirmaLongo) {
      setErro(
        `Foram ${nf(rodado)} km neste roteiro. Se estiver certo, confirme no quadro abaixo e diga para onde foi.`,
      );
      return;
    }
    if (rodado > KM_AVISO && !motivoLongo.trim()) {
      setErro("Diga para onde o roteiro foi. O gestor vai conferir esse km depois.");
      return;
    }

    setSalvando(true);
    const supabase = createClient();

    let fotoUrl: string | null = null;
    try {
      fotoUrl = await enviarFoto(supabase, "roteiros", `${sel.id}/chegada`, foto?.[0]);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao enviar a foto.");
      setSalvando(false);
      return;
    }

    const { error } = await supabase
      .from("roteiros")
      .update({
        chegada_em: new Date().toISOString(),
        km_chegada: kmNum,
        tecnico_chegada_id: tecnicoChegadaId || sel.tecnico_saida_id,
        obs_chegada:
          [rodado > KM_AVISO ? `Km alto (${nf(rodado)} km): ${motivoLongo.trim()}` : null, obs.trim() || null]
            .filter(Boolean)
            .join(" · ") || null,
        houve_pendencia: pendencia,
        descricao_pendencias: pendencia ? descPend.trim() || null : null,
        foto_painel_chegada: fotoUrl,
      })
      .eq("id", sel.id);

    if (error) {
      if (error.code === "23514") {
        setErro(
          "O banco recusou o km. Confira o hodômetro: a diferença até a saída passou do limite " +
            `de ${nf(KM_ABSURDO)} km.`,
        );
      } else {
        setErro(error.message);
      }
      setSalvando(false);
    } else {
      setOk(true);
      setSalvando(false);
    }
  }

  function dataHora(s: string) {
    return diaHoraDe(s) ?? "";
  }

  return (
    <Pagina estreita titulo="Registrar chegada" subtitulo="Fecha um roteiro que está na rua.">
      <Cartao className="p-5">
        {ok ? (
          <div>
            <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
              <CheckCircle2 size={18} className="mt-px shrink-0" />
              <span>
                <b>Chegada registrada.</b> Roteiro fechado.
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Botao
                tamanho="lg"
                className="flex-1"
                onClick={() => {
                  setOk(false);
                  setRoteiroId("");
                  setKm("");
                  setObs("");
                  setPendencia(false);
                  setDescPend("");
                  setConfirmaLongo(false);
                  setMotivoLongo("");
                  setFoto(null);
                  setCarregando(true);
                  void carregar();
                }}
              >
                Registrar outra chegada
              </Botao>
              <BotaoLink href="/campo" variante="primario" tamanho="lg" className="flex-1">
                Voltar ao início
              </BotaoLink>
            </div>
          </div>
        ) : carregando ? (
          <Carregando texto="Carregando roteiros abertos…" />
        ) : abertos.length === 0 ? (
          <Vazio
            titulo="Nenhum roteiro aberto no momento."
            texto="Só é possível registrar a chegada de um veículo que teve a saída lançada."
          >
            <BotaoLink href="/roteiro/saida" variante="primario">
              Registrar uma saída
            </BotaoLink>
          </Vazio>
        ) : (
          <form onSubmit={salvar} className="space-y-3.5">
            <Campo rotulo="Roteiro aberto">
              <Select required value={roteiroId} onChange={(e) => selecionar(e.target.value)}>
                <option value="">Selecione…</option>
                {abertos.map((r) => {
                  const v = one(r.veiculo);
                  const t = one(r.tecnico);
                  return (
                    <option key={r.id} value={r.id}>
                      {v?.modelo} {v?.placa} — {t?.nome} — saiu {dataHora(r.saida_em)} ({r.km_saida} km)
                    </option>
                  );
                })}
              </Select>
            </Campo>

            {sel && (
              <>
                <CampoNumero
                  rotulo="Km de chegada"
                  unidade="km"
                  required
                  valor={km}
                  onValor={setKm}
                  placeholder="ex.: 66655"
                  dica={`Km na saída: ${nf(sel.km_saida)}.`}
                />

                <Campo rotulo="Técnico na chegada">
                  <Select value={tecnicoChegadaId} onChange={(e) => setTecnicoChegadaId(e.target.value)}>
                    {tecnicos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nome}
                      </option>
                    ))}
                  </Select>
                </Campo>

                {kmAbsurdo && (
                  <div className="rounded-lg bg-red-50 p-3.5 ring-1 ring-inset ring-red-200">
                    <div className="flex items-center gap-2 text-sm font-bold text-red-800">
                      <AlertTriangle size={16} />
                      {nf(rodado!)} km num roteiro só?
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-red-800">
                      Esse número é o hodômetro inteiro, não a distância. Confira o painel do veículo e
                      digite o km que está marcado agora.
                    </p>
                  </div>
                )}

                {kmAlto && (
                  <div className="rounded-lg bg-amber-50 p-3.5 ring-1 ring-inset ring-amber-200">
                    <div className="flex items-center gap-2 text-sm font-bold text-amber-800">
                      <AlertTriangle size={16} />
                      Roteiro longo: {nf(rodado!)} km
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-amber-800">
                      Dá para registrar normalmente. Só confirme que o km está certo — o gestor recebe
                      esse roteiro marcado para conferir.
                    </p>
                    <label className="my-2.5 flex items-center gap-2 text-[13.5px] font-semibold text-amber-800">
                      <Checkbox
                        checked={confirmaLongo}
                        onChange={(e) => {
                          setConfirmaLongo(e.target.checked);
                          setErro(null);
                        }}
                      />
                      Confirmo: rodei mesmo {nf(rodado!)} km
                    </label>
                    <Input
                      type="text"
                      value={motivoLongo}
                      onChange={(e) => setMotivoLongo(e.target.value)}
                      placeholder="para onde foi? ex.: entrega em Juiz de Fora"
                    />
                  </div>
                )}

                <label className="flex items-center gap-2 text-[13px] font-medium text-slate-700">
                  <Checkbox checked={pendencia} onChange={(e) => setPendencia(e.target.checked)} />
                  Houve pendência no roteiro
                </label>
                {pendencia && (
                  <Input
                    type="text"
                    value={descPend}
                    onChange={(e) => setDescPend(e.target.value)}
                    placeholder="descreva a pendência"
                  />
                )}

                <Campo rotulo="Observação (opcional)">
                  <Input
                    type="text"
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    placeholder="algo a registrar na chegada"
                  />
                </Campo>

                <Campo rotulo="Foto do painel / hodômetro (opcional)">
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(e) => setFoto(e.target.files)}
                    className="file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-700"
                  />
                </Campo>
              </>
            )}

            <Botao
              type="submit"
              variante="primario"
              tamanho="lg"
              disabled={salvando || !sel}
              className="w-full"
            >
              {salvando ? "Registrando…" : "Registrar chegada"}
            </Botao>

            {erro && <Aviso>{erro}</Aviso>}
          </form>
        )}
      </Cartao>
    </Pagina>
  );
}
