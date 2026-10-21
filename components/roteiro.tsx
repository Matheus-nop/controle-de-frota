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
import { Ruler } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { mensagemDeErro } from "@/lib/frota/erro";
import { paraInteiro } from "@/lib/frota/numero";
import { dataBR } from "@/lib/frota/tempo";
import {
  acrescentarCorrecoes,
  CAMPO_KM_CHEGADA,
  CAMPO_KM_SAIDA,
  type Correcao,
  type Mudanca,
} from "@/lib/frota/correcao";
import {
  conferirCorrecao,
  kmParaORastro,
  vizinhosDoRoteiro,
  type RoteiroDoVeiculo,
  type Vizinhos,
} from "@/lib/frota/km";
import { Aviso, Botao, CampoNumero, Checkbox, Modal } from "@/components/ui";

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
