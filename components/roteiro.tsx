"use client";

// A correção do km de um roteiro, feita pelo gestor.
//
// O caso que a trouxe: "era 212 e o rapaz digitou 2012". O roteiro saiu com um
// hodômetro que não existe, a chegada virou impossível (o banco recusa chegada
// menor que saída) e o veículo ficou "NA RUA" sem jeito de fechar pelo app.
// Até aqui a saída era SQL na mão.
//
// Três coisas que esta tela faz e que um UPDATE solto não faria:
//
//   * confere contra os roteiros vizinhos do MESMO veículo — a corrente do
//     hodômetro — e mostra o que não fecha, em vez de deixar o gestor
//     descobrir pelo painel semanas depois;
//   * deixa rastro em `roteiros.correcoes`, porque "rodou 212 km" e "alguém
//     DISSE depois que foram 212" não são a mesma frase;
//   * apaga a conferência de km alto quando o número muda: quem conferiu,
//     conferiu OUTRO número. Deixar o carimbo valendo esconderia o roteiro da
//     fila justamente depois de ele ter mudado.
//
// A regra de o que barra e o que só avisa mora em lib/frota/km.ts, com teste.

import { useEffect, useState } from "react";
import { Flag, Ruler } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { mensagemDeErro } from "@/lib/frota/erro";
import { paraInteiro } from "@/lib/frota/numero";
import { dataBR, diaHoraDe } from "@/lib/frota/tempo";
import {
  acrescentarCorrecoes,
  CAMPO_CHEGADA,
  CAMPO_KM_CHEGADA,
  CAMPO_KM_SAIDA,
  type Correcao,
  type Mudanca,
} from "@/lib/frota/correcao";
import {
  conferirCorrecao,
  conferirFechamento,
  kmParaORastro,
  vizinhosDoRoteiro,
  KM_AVISO,
  type RoteiroDoVeiculo,
  type Vizinhos,
} from "@/lib/frota/km";
import { Aviso, Botao, Campo, CampoNumero, Checkbox, Input, Modal, Select } from "@/components/ui";

/** O recorte do roteiro de que a correção precisa. */
export type RoteiroParaCorrigir = {
  id: string;
  veiculoId: string;
  placa: string;
  modelo: string;
  /** O dia da saída, "2026-10-21". */
  data: string;
  /** A saída com hora, para achar os vizinhos na ordem certa. */
  saidaEm: string;
  tecnico: string;
  /** Quem levou. É o palpite de quem entregou, no fechamento pelo gestor: na
   *  prática é quase sempre a mesma pessoa, e deixar o campo vazio faria o
   *  roteiro fechar sem técnico de chegada. */
  tecnicoSaidaId: string | null;
  kmSaida: number | null;
  kmChegada: number | null;
  correcoes: Correcao[];
};

const SEM_VIZINHOS: Vizinhos = { anterior: null, seguinte: null };

export function CorrigirKm({
  r,
  quem,
  onFechar,
  onSalvo,
}: {
  r: RoteiroParaCorrigir;
  quem: string | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [saida, setSaida] = useState(r.kmSaida != null ? String(r.kmSaida) : "");
  const [chegada, setChegada] = useState(r.kmChegada != null ? String(r.kmChegada) : "");
  const [vizinhos, setVizinhos] = useState<Vizinhos>(SEM_VIZINHOS);
  const [conferindo, setConferindo] = useState(true);
  const [confirmado, setConfirmado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const aberto = r.kmChegada == null;

  // Os roteiros vizinhos do veículo. A busca mora dentro do efeito, e não num
  // callback que ele chama: o lint do projeto barra mexer no estado direto no
  // corpo do efeito, e com razão.
  useEffect(() => {
    let valeu = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("roteiros")
        .select("id, saida_em, km_saida, km_chegada")
        .eq("veiculo_id", r.veiculoId)
        .order("saida_em");
      if (!valeu) return;
      setVizinhos(vizinhosDoRoteiro(r.id, r.saidaEm, (data as RoteiroDoVeiculo[]) ?? []));
      setConferindo(false);
    })();
    return () => {
      valeu = false;
    };
  }, [r.id, r.veiculoId, r.saidaEm]);

  const kmSaida = paraInteiro(saida);
  const kmChegada = aberto ? null : paraInteiro(chegada);
  const c = conferirCorrecao({ kmSaida, kmChegada, vizinhos });

  const mudou = kmSaida !== r.kmSaida || (!aberto && kmChegada !== r.kmChegada);
  const precisaConfirmar = c.avisos.length > 0;
  const podeGravar =
    !salvando && !conferindo && mudou && c.impedimentos.length === 0 && (!precisaConfirmar || confirmado);

  async function gravar() {
    setSalvando(true);
    setErro(null);
    try {
      const mudancas: Mudanca[] = [
        { campo: CAMPO_KM_SAIDA, de: kmParaORastro(r.kmSaida), para: kmParaORastro(kmSaida) },
      ];
      if (!aberto) {
        mudancas.push({
          campo: CAMPO_KM_CHEGADA,
          de: kmParaORastro(r.kmChegada),
          para: kmParaORastro(kmChegada),
        });
      }

      const supabase = createClient();
      // O `.select` confere que alterou mesmo: UPDATE barrado pela RLS volta
      // sem erro e com zero linhas, e aí o botão fingiria ter funcionado.
      const { data, error } = await supabase
        .from("roteiros")
        .update({
          km_saida: kmSaida,
          ...(aberto ? {} : { km_chegada: kmChegada }),
          correcoes: acrescentarCorrecoes(r.correcoes, mudancas, quem),
          // O km mudou: a conferência de antes era de outro número.
          km_verificado_em: null,
          km_verificado_por: null,
        })
        .eq("id", r.id)
        .select("id");

      if (error) {
        // 23514 = check constraint. A conferência acima já deveria ter pegado,
        // mas se escapar o gestor merece a frase em português.
        setErro(
          error.code === "23514"
            ? "O banco recusou esse km: a diferença entre saída e chegada passou do limite."
            : mensagemDeErro(error, "a correção do km"),
        );
        return;
      }
      if (!data || data.length === 0) {
        setErro(
          "Nada foi alterado: corrigir o km de um roteiro é do gestor da frota, ou do técnico que fez esse roteiro.",
        );
        return;
      }
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, "a correção do km"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      titulo={`Corrigir o km · ${r.placa} · ${dataBR(r.data)}`}
      onFechar={onFechar}
      rodape={
        <>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" disabled={!podeGravar} onClick={gravar}>
            <Ruler size={14} />
            {salvando ? "Gravando…" : "Gravar correção"}
          </Botao>
        </>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[13px] leading-relaxed text-slate-600">
          O roteiro de <strong>{r.tecnico}</strong> em {r.modelo} {r.placa}. Corrija o que foi
          digitado errado no hodômetro — a correção fica registrada no cartão do roteiro, com seu
          nome, e o km rodado se refaz sozinho.
        </p>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <CampoNumero
            rotulo="Km de saída"
            valor={saida}
            onValor={setSaida}
            unidade="km"
            inputMode="numeric"
            dica={r.kmSaida != null ? `Está gravado ${r.kmSaida.toLocaleString("pt-BR")} km.` : undefined}
          />
          {aberto ? (
            <div>
              <span className="rotulo">Km de chegada</span>
              <div className="campo bg-slate-50 text-slate-500">ainda não chegou</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-slate-500">
                Corrigida a saída, o técnico fecha o roteiro normalmente em Registrar chegada.
              </p>
            </div>
          ) : (
            <CampoNumero
              rotulo="Km de chegada"
              valor={chegada}
              onValor={setChegada}
              unidade="km"
              inputMode="numeric"
              dica={
                r.kmChegada != null ? `Está gravado ${r.kmChegada.toLocaleString("pt-BR")} km.` : undefined
              }
            />
          )}
        </div>

        {c.rodado != null && c.rodado >= 0 && (
          <p className="text-[12.5px] text-slate-600">
            Ficam <strong className="tabular-nums">{c.rodado.toLocaleString("pt-BR")} km</strong>{" "}
            rodados neste roteiro.
          </p>
        )}

        {conferindo && <p className="text-[12.5px] text-slate-400">Conferindo os roteiros vizinhos…</p>}

        {c.impedimentos.map((m) => (
          <Aviso key={m}>{m}</Aviso>
        ))}

        {/* Aviso não tranca: quem corrige costuma estar arrumando dois roteiros
            errados em sequência, e travar prenderia os dois. Mas tem que ser
            visto — daí a marcação. */}
        {c.impedimentos.length === 0 && precisaConfirmar && (
          <div className="rounded-lg bg-amber-50 p-3 text-[12.5px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            {c.avisos.map((a) => (
              <p key={a} className="mb-1.5">
                {a}
              </p>
            ))}
            <label className="mt-1 flex items-start gap-2 font-medium">
              <Checkbox checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
              Conferi e é isso mesmo.
            </label>
          </div>
        )}

        {!mudou && !conferindo && (
          <p className="text-[12.5px] text-slate-400">Nenhum número mudou ainda.</p>
        )}

        {erro && <Aviso>{erro}</Aviso>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------- fechar pelo gestor --------- */

/**
 * O fechamento do roteiro pelo gestor, quando o técnico não conseguiu.
 *
 * O caso: a BONGO saiu em 09/11 com 21.635 km. O técnico foi fechar, o km
 * passou de 600, e o app pediu que ele confirmasse e dissesse para onde foi.
 * Ele parou aí. Oito dias depois o veículo continuava "NA RUA" no painel, e o
 * gestor só tinha Corrigir km — que não fecha nada.
 *
 * Três coisas que esta tela faz e que a do técnico não faria:
 *
 *   * a DATA da chegada é digitada. O veículo voltou dias atrás; carimbar
 *     "agora" gravaria uma chegada que não aconteceu hoje, e o relatório
 *     mensal contaria o roteiro no mês errado.
 *   * deixa rastro: "o veículo chegou às 14h" e "o gestor DISSE depois que
 *     chegou às 14h" não são a mesma frase para quem ler o histórico.
 *   * confere contra os roteiros vizinhos, como a correção de km.
 */
export function FecharRoteiro({
  r,
  quem,
  onFechar,
  onSalvo,
}: {
  r: RoteiroParaCorrigir;
  quem: string | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [km, setKm] = useState("");
  const [quando, setQuando] = useState("");
  const [tecnicoId, setTecnicoId] = useState(r.tecnicoSaidaId ?? "");
  const [tecnicos, setTecnicos] = useState<{ id: string; nome: string }[]>([]);
  const [motivo, setMotivo] = useState("");
  const [obs, setObs] = useState("");
  const [vizinhos, setVizinhos] = useState<Vizinhos>(SEM_VIZINHOS);
  const [confirmado, setConfirmado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let valeu = true;
    (async () => {
      const supabase = createClient();
      const [rs, ts] = await Promise.all([
        supabase
          .from("roteiros")
          .select("id, saida_em, km_saida, km_chegada")
          .eq("veiculo_id", r.veiculoId)
          .order("saida_em"),
        supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
      ]);
      if (!valeu) return;
      setVizinhos(vizinhosDoRoteiro(r.id, r.saidaEm, (rs.data as RoteiroDoVeiculo[]) ?? []));
      setTecnicos((ts.data as { id: string; nome: string }[]) ?? []);
    })();
    return () => {
      valeu = false;
    };
  }, [r.id, r.veiculoId, r.saidaEm]);

  const kmChegada = paraInteiro(km);
  // O campo datetime-local vem sem fuso; o navegador da equipe está em São
  // Paulo, que é o mesmo pressuposto do `new Date().toISOString()` que a tela
  // do técnico já usa.
  const chegadaEm = quando ? new Date(quando).toISOString() : null;
  const c = conferirFechamento({
    kmSaida: r.kmSaida ?? 0,
    kmChegada,
    saidaEm: r.saidaEm,
    chegadaEm,
    vizinhos,
  });

  const kmAlto = c.rodado != null && c.rodado > KM_AVISO;
  const precisaConfirmar = c.avisos.length > 0;
  const faltaMotivo = kmAlto && !motivo.trim();
  const podeGravar =
    !salvando &&
    c.impedimentos.length === 0 &&
    !faltaMotivo &&
    (!precisaConfirmar || confirmado);

  async function gravar() {
    if (kmChegada == null || !chegadaEm) return;
    setSalvando(true);
    setErro(null);
    try {
      const supabase = createClient();
      const mudancas: Mudanca[] = [
        {
          campo: CAMPO_CHEGADA,
          de: null,
          para: `${kmParaORastro(kmChegada)} em ${diaHoraDe(chegadaEm) ?? "—"}`,
        },
      ];
      // Mesma frase que a tela do técnico grava, para o histórico ler igual
      // tendo sido fechado por um ou por outro.
      const recado =
        [
          kmAlto ? `Km alto (${c.rodado} km): ${motivo.trim()}` : null,
          obs.trim() || null,
          `Fechado pelo gestor${quem ? ` (${quem})` : ""}.`,
        ]
          .filter(Boolean)
          .join(" · ") || null;

      const { data, error } = await supabase
        .from("roteiros")
        .update({
          chegada_em: chegadaEm,
          km_chegada: kmChegada,
          tecnico_chegada_id: tecnicoId || null,
          obs_chegada: recado,
          correcoes: acrescentarCorrecoes(r.correcoes, mudancas, quem),
        })
        .eq("id", r.id)
        .select("id");

      if (error) {
        setErro(
          error.code === "23514"
            ? "O banco recusou: confira o km e a data da chegada."
            : mensagemDeErro(error, "o fechamento do roteiro"),
        );
        return;
      }
      if (!data || data.length === 0) {
        setErro(
          "Nada foi alterado: fechar roteiro é do gestor da frota, ou do técnico que fez esse roteiro.",
        );
        return;
      }
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, "o fechamento do roteiro"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      titulo={`Fechar o roteiro · ${r.placa} · ${dataBR(r.data)}`}
      onFechar={onFechar}
      rodape={
        <>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="primario" disabled={!podeGravar} onClick={gravar}>
            <Flag size={14} />
            {salvando ? "Fechando…" : "Fechar roteiro"}
          </Botao>
        </>
      }
    >
      <div className="space-y-3.5">
        <p className="text-[13px] leading-relaxed text-slate-600">
          O roteiro de <strong>{r.tecnico}</strong> saiu em {diaHoraDe(r.saidaEm) ?? dataBR(r.data)}{" "}
          com {r.kmSaida?.toLocaleString("pt-BR") ?? "—"} km e nunca foi fechado. Lance a chegada
          que aconteceu — o fechamento fica registrado no cartão do roteiro, com seu nome.
        </p>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <CampoNumero
            rotulo="Km de chegada"
            valor={km}
            onValor={setKm}
            unidade="km"
            inputMode="numeric"
            dica="O hodômetro quando o veículo voltou."
          />
          <Campo rotulo="Voltou em" dica="A data e a hora reais, não as de hoje.">
            <Input
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Quem entregou">
            <Select value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
              <option value="">—</option>
              {tecnicos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Observação">
            <Input value={obs} onChange={(e) => setObs(e.target.value)} />
          </Campo>
        </div>

        {c.rodado != null && c.rodado >= 0 && (
          <p className="text-[12.5px] text-slate-600">
            Ficam <strong className="tabular-nums">{c.rodado.toLocaleString("pt-BR")} km</strong>{" "}
            rodados neste roteiro.
          </p>
        )}

        {c.impedimentos.map((m) => (
          <Aviso key={m}>{m}</Aviso>
        ))}

        {/* Acima de 600 km o roteiro vai para a fila de conferência, e o
            "para onde foi" é o que o gestor vai ler lá. É o mesmo pedido que a
            tela do técnico faz — e foi onde ele parou. */}
        {c.impedimentos.length === 0 && precisaConfirmar && (
          <div className="rounded-lg bg-amber-50 p-3 text-[12.5px] leading-relaxed text-amber-900 ring-1 ring-inset ring-amber-200">
            {c.avisos.map((a) => (
              <p key={a} className="mb-1.5">
                {a}
              </p>
            ))}
            {kmAlto && (
              <div className="mb-2">
                <Input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="para onde foi? ex.: entrega em Juiz de Fora"
                />
              </div>
            )}
            <label className="mt-1 flex items-start gap-2 font-medium">
              <Checkbox checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
              Conferi e é isso mesmo.
            </label>
          </div>
        )}

        {erro && <Aviso>{erro}</Aviso>}
      </div>
    </Modal>
  );
}
