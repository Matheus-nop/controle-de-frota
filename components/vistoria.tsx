"use client";

// As três correções que o gestor faz numa vistoria já enviada.
//
// Vieram da primeira semana de uso, e são a mesma pergunta vista de três
// ângulos: **o que fazer quando a vistoria não saiu como devia**.
//
// - `ReclassificarFotos` — o técnico mandou o dano como foto semanal.
// - `AnexarFotos` — a foto não subiu na hora e chegou depois, por fora.
// - `ExcluirVistoria` — a vistoria inteira foi feita errada.
//
// As três têm a mesma disciplina: nada se apaga, tudo fica assinado, e a tela
// mostra a assinatura. Vistoria é prova — é o que responde, um mês depois, se
// o amassado já estava lá. Correção que apaga o rastro destrói exatamente o
// que a vistoria servia para guardar.
//
// Moram aqui, e não dentro de `/historico`, porque a tela do histórico já
// passava de mil linhas e porque peça isolada se prova isolada.

import { useState } from "react";
import { ImageOff, ImagePlus, Trash2, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ANGULOS } from "@/lib/frota/angulos";
import { anexarComoAvaria, anexarSemanais, removerAnexo } from "@/lib/frota/anexo";
import {
  AVARIA_ONDE,
  AVARIA_TIPO,
  desfazerReclassificacao,
  reclassificarComoAvaria,
  resumoDaAvaria,
  type Avaria,
} from "@/lib/frota/avarias";
import { enviarFoto, enviarFotos } from "@/lib/frota/foto";
import { mensagemDeErro } from "@/lib/frota/erro";
import { dataBR } from "@/lib/frota/tempo";
import {
  Aviso,
  Botao,
  Campo,
  CampoFoto,
  CampoFotos,
  Input,
  Modal,
  Select,
  cx,
} from "@/components/ui";

/**
 * Grava na vistoria, e confere se gravou mesmo.
 *
 * O `.select("id")` no fim não é enfeite. A RLS de `checklists` só deixa o
 * gestor escrever, e um UPDATE barrado por policy NÃO volta com erro: as linhas
 * simplesmente não existem para quem não pode alterá-las, e o Postgres informa
 * "zero linhas alteradas" com toda a calma. Sem conferir a contagem, o PCM
 * clicaria em excluir, o modal fecharia satisfeito e nada teria acontecido —
 * pior do que recusar, porque ele só descobriria dias depois.
 */
async function gravarVistoria(id: string, campos: Record<string, unknown>): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase.from("checklists").update(campos).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Nada foi alterado: só o gestor da frota pode corrigir vistoria.");
  }
}

/** Uma foto do registro, já classificada pela tela que montou a lista. */
export type FotoDaVistoria = {
  url: string;
  legenda: string;
  semanal?: boolean;
  /** Quem anexou depois, quando não foi o técnico que mandou na vistoria. */
  anexadaPor?: string;
};

/** O que estas peças precisam saber de uma vistoria. É menos do que o registro
 *  inteiro do histórico de propósito: assim elas servem a qualquer tela que
 *  mostre vistoria, e podem ser montadas num teste sem banco nenhum. */
export type Vistoria = {
  checklistId: string;
  veiculoId: string | null;
  placa: string;
  data: string;
  tecnico: string;
  itens: unknown;
  fotos: FotoDaVistoria[];
  avarias: Avaria[];
};

/**
 * O gestor corrige a classificação de uma foto.
 *
 * O caso real: o técnico mandou onze fotos, todas marcadas como "semanal", e
 * várias eram dano — farol quebrado, porta amassada. A vistoria ficou com zero
 * avaria: o alerta não dispara, o comparativo da semana seguinte não tem com o
 * que comparar, e o filtro de avaria não acha nada.
 *
 * Pedir para o técnico refazer não resolve: ele já entregou o veículo e foi
 * para a rua. Quem consegue olhar a foto e dizer "isto é a traseira amassada" é
 * o gestor, depois.
 *
 * A foto não muda e não se apaga nada — muda a classificação, e a mudança fica
 * assinada. Só quem tem papel de gestor chega aqui, porque só ele passa pela
 * policy de update de `checklists`.
 */
export function ReclassificarFotos({
  r,
  quem,
  onFechar,
  onSalvo,
}: {
  r: Vistoria;
  quem: string | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const semanais = r.fotos.filter((f) => f.semanal).map((f) => f.url);
  const [escolhidas, setEscolhidas] = useState<string[]>([]);
  const [onde, setOnde] = useState("");
  const [tipo, setTipo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const reclassificadas = r.avarias
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.reclassificada_por);

  async function gravar(novoItens: Record<string, unknown>) {
    setSalvando(true);
    setErro(null);
    try {
      await gravarVistoria(r.checklistId, { itens: novoItens });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, "a reclassificação"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto titulo={`Reclassificar fotos · ${r.placa} · ${dataBR(r.data)}`} onFechar={onFechar}>
      <div className="space-y-3.5">
        <p className="text-[13px] leading-relaxed text-slate-600">
          Escolha as fotos que são avaria e diga o que é. Elas saem das fotos semanais e passam a
          contar como avaria desta vistoria — e ficam marcadas como reclassificadas por você.
        </p>

        {semanais.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-[13px] text-slate-500">
            <ImageOff size={15} />
            Nenhuma foto semanal sobrando nesta vistoria.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {semanais.map((u) => {
                const marcada = escolhidas.includes(u);
                return (
                  <button
                    key={u}
                    type="button"
                    onClick={() =>
                      setEscolhidas((l) => (l.includes(u) ? l.filter((x) => x !== u) : [...l, u]))
                    }
                    className={cx(
                      "relative block rounded-lg ring-2 transition",
                      marcada ? "ring-amber-500" : "ring-transparent hover:ring-slate-300",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u}
                      alt="foto da vistoria"
                      loading="lazy"
                      className={cx(
                        "block h-[84px] w-[84px] rounded-lg object-cover",
                        !marcada && "opacity-70",
                      )}
                    />
                    {marcada && (
                      <span className="absolute right-1 top-1 rounded bg-amber-500 px-1 text-[10px] font-bold text-white">
                        avaria
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Campo rotulo="Onde?">
                <Select value={onde} onChange={(e) => setOnde(e.target.value)}>
                  <option value="">Selecione…</option>
                  {AVARIA_ONDE.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo rotulo="Tipo de avaria">
                <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="">Selecione…</option>
                  {AVARIA_TIPO.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </Campo>
            </div>
            <Campo rotulo="Descrição (opcional)">
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </Campo>

            <div className="flex flex-wrap items-center gap-3">
              <Botao
                variante="primario"
                disabled={salvando || escolhidas.length === 0 || (!onde && !tipo)}
                onClick={() =>
                  gravar(
                    reclassificarComoAvaria(
                      r.itens,
                      escolhidas,
                      { onde, tipo, descricao: descricao.trim() || null },
                      quem,
                    ),
                  )
                }
              >
                {salvando
                  ? "Salvando…"
                  : `Marcar ${escolhidas.length || ""} foto(s) como avaria`.replace("  ", " ")}
              </Botao>
              {escolhidas.length > 0 && !onde && !tipo && (
                <span className="text-[12.5px] text-slate-500">Diga ao menos onde ou o tipo.</span>
              )}
            </div>
          </>
        )}

        {reclassificadas.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
              Já reclassificadas por alguém
            </div>
            <div className="flex flex-col gap-2">
              {reclassificadas.map(({ a, i }) => (
                <div
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-2.5 ring-1 ring-inset ring-amber-200"
                >
                  <span className="text-[13px] font-semibold text-slate-800">{resumoDaAvaria(a)}</span>
                  <span className="text-[11.5px] text-slate-500">
                    {a.fotos.length} foto(s) · por {a.reclassificada_por}
                  </span>
                  <Botao
                    tamanho="sm"
                    className="ml-auto"
                    disabled={salvando}
                    onClick={() => gravar(desfazerReclassificacao(r.itens, i))}
                  >
                    <Undo2 size={13} />
                    Desfazer
                  </Botao>
                </div>
              ))}
            </div>
          </div>
        )}

        {erro && <Aviso>{erro}</Aviso>}
      </div>
    </Modal>
  );
}


/**
 * O gestor anexa foto a uma vistoria já enviada.
 *
 * O caso: o celular do técnico ficou sem espaço na terceira foto, ou a foto do
 * farol quebrado saiu preta e ele mandou outra por fora. Sem esta tela, essas
 * fotos morrem na conversa do WhatsApp e a vistoria fica incompleta para
 * sempre — e é ela que vai responder, daqui a um mês, se o amassado já estava
 * lá.
 *
 * Refazer a vistoria seria pior: inventaria uma vistoria que não aconteceu,
 * com a data e o km de hoje. Aconteceu UMA vistoria, com foto que chegou
 * atrasada — e é isso que fica registrado, com a marca de quem anexou.
 */
export function AnexarFotos({
  r,
  quem,
  onFechar,
  onSalvo,
}: {
  r: Vistoria;
  quem: string | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [destino, setDestino] = useState<"SEMANAL" | "AVARIA">("SEMANAL");
  const [porAngulo, setPorAngulo] = useState<Record<string, File | null>>({});
  const [outras, setOutras] = useState<File[]>([]);
  const [daAvaria, setDaAvaria] = useState<File[]>([]);
  const [onde, setOnde] = useState("");
  const [tipo, setTipo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviadas, setEnviadas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  // Que ângulos esta vistoria já tem. Serve para o gestor ver de relance o que
  // faltou, em vez de conferir foto por foto no cartão atrás do modal.
  const jaTem = new Set(r.fotos.filter((f) => f.semanal).map((f) => f.legenda.replace(/ /g, "_")));
  const anexadas = r.fotos.filter((f) => f.anexadaPor);

  async function gravar(novoItens: Record<string, unknown>) {
    await gravarVistoria(r.checklistId, { itens: novoItens });
    onSalvo();
  }

  async function enviar() {
    if (!r.veiculoId) {
      setErro("Esta vistoria não tem veículo — não dá para anexar foto nela.");
      return;
    }
    const doAngulo = ANGULOS.filter(([chave]) => porAngulo[chave]);
    const total =
      destino === "SEMANAL" ? doAngulo.length + outras.length : daAvaria.length;
    if (total === 0) {
      setErro("Escolha ao menos uma foto.");
      return;
    }
    if (destino === "AVARIA" && !onde && !tipo) {
      setErro("Diga ao menos onde ou o tipo da avaria.");
      return;
    }
    setSalvando(true);
    setErro(null);
    setEnviadas(0);
    const contar = () => setEnviadas((n) => n + 1);
    try {
      const supabase = createClient();
      if (destino === "SEMANAL") {
        const novas: { url: string; angulo: string | null }[] = [];
        for (const [chave] of doAngulo) {
          const url = await enviarFoto(supabase, "checklists", `${r.veiculoId}/anexo-${chave}`, porAngulo[chave]);
          if (url) novas.push({ url, angulo: chave });
          contar();
        }
        const soltas = await enviarFotos(supabase, "checklists", `${r.veiculoId}/anexo`, outras, contar);
        await gravar(anexarSemanais(r.itens, [...novas, ...soltas.map((url) => ({ url, angulo: null }))], quem));
      } else {
        const fotos = await enviarFotos(supabase, "checklists", `${r.veiculoId}/anexo-avaria`, daAvaria, contar);
        await gravar(
          anexarComoAvaria(r.itens, fotos, { onde: onde || null, tipo: tipo || null, descricao: descricao.trim() || null }, quem),
        );
      }
    } catch (err) {
      setErro(mensagemDeErro(err, "o anexo das fotos"));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(url: string) {
    setSalvando(true);
    setErro(null);
    try {
      await gravar(removerAnexo(r.itens, url));
    } catch (err) {
      setErro(mensagemDeErro(err, "a remoção da foto"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal aberto titulo={`Anexar fotos · ${r.placa} · ${dataBR(r.data)}`} onFechar={onFechar}>
      <div className="space-y-3.5">
        <p className="text-[13px] leading-relaxed text-slate-600">
          Para quando o técnico não conseguiu enviar na hora. A foto entra nesta vistoria, na data
          dela, marcada como anexada por você — e essa marca aparece no histórico e no comparativo.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {(["SEMANAL", "AVARIA"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDestino(d)}
              className={cx(
                "rounded-full px-3 py-1.5 text-[12.5px] font-semibold ring-1 ring-inset transition",
                destino === d
                  ? "bg-brand-700 text-white ring-brand-700"
                  : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
              )}
            >
              {d === "SEMANAL" ? "Fotos do veículo" : "É uma avaria"}
            </button>
          ))}
        </div>

        {destino === "SEMANAL" ? (
          <div className="space-y-2.5">
            {ANGULOS.map(([chave, rotulo, dica]) => (
              <CampoFoto
                key={chave}
                rotulo={rotulo}
                dica={jaTem.has(chave) ? "a vistoria já tem esta — anexar acrescenta outra" : dica}
                arquivo={porAngulo[chave] ?? null}
                onArquivo={(f) => setPorAngulo((m) => ({ ...m, [chave]: f }))}
              />
            ))}
            <CampoFotos
              rotulo="Outras fotos"
              dica="O que não é um dos cinco ângulos: um detalhe, um documento."
              arquivos={outras}
              onArquivos={setOutras}
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            <CampoFotos
              rotulo="Fotos do dano"
              dica="Entram já como avaria desta vistoria — não passam por semanal."
              arquivos={daAvaria}
              onArquivos={setDaAvaria}
            />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Campo rotulo="Onde?">
                <Select value={onde} onChange={(e) => setOnde(e.target.value)}>
                  <option value="">Selecione…</option>
                  {AVARIA_ONDE.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo rotulo="Tipo de avaria">
                <Select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  <option value="">Selecione…</option>
                  {AVARIA_TIPO.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </Select>
              </Campo>
            </div>
            <Campo rotulo="Descrição (opcional)">
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
            </Campo>
          </div>
        )}

        <Botao variante="primario" disabled={salvando} onClick={enviar}>
          <ImagePlus size={14} />
          {salvando ? `Enviando foto ${enviadas + 1}…` : "Anexar à vistoria"}
        </Botao>

        {anexadas.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
              Já anexadas depois da vistoria
            </div>
            <div className="flex flex-wrap gap-2">
              {anexadas.map((f) => (
                <div key={f.url} className="w-[84px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.url}
                    alt={f.legenda}
                    loading="lazy"
                    className="block h-[84px] w-[84px] rounded-lg object-cover ring-1 ring-amber-300"
                  />
                  <button
                    type="button"
                    disabled={salvando}
                    onClick={() => remover(f.url)}
                    className="mt-1 block w-full text-center text-[10.5px] text-slate-500 hover:text-red-600"
                  >
                    tirar ({f.anexadaPor})
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] text-slate-400">
              Só sai o que foi anexado depois. Foto que o técnico mandou na vistoria não se apaga
              por aqui.
            </p>
          </div>
        )}

        {erro && <Aviso>{erro}</Aviso>}
      </div>
    </Modal>
  );
}


/**
 * Excluir a vistoria feita errada.
 *
 * Errada acontece: o técnico escolhe o veículo de cima da lista em vez do que
 * está dirigindo, digita o km com um zero a mais, ou manda duas vezes achando
 * que a primeira não foi. O registro errado atrapalha exatamente quem tenta
 * entender o que houve com o veículo.
 *
 * Ela sai de tudo — histórico, comparativo, último checklist do técnico,
 * alerta de avaria nova — e continua guardada. Duas vistorias do mesmo veículo
 * no mesmo dia é o caso normal, não o raro: excluir a linha errada de verdade,
 * com as fotos, não teria volta.
 */
export function ExcluirVistoria({
  r,
  quemId,
  onFechar,
  onSalvo,
}: {
  r: Vistoria;
  quemId: string | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function excluir() {
    if (!motivo.trim()) {
      setErro("Diga por que está excluindo. Sem isso vira mistério em três semanas.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await gravarVistoria(r.checklistId, {
        anulada_em: new Date().toISOString(),
        anulada_por: quemId,
        motivo_anulacao: motivo.trim(),
      });
      onSalvo();
    } catch (err) {
      setErro(mensagemDeErro(err, "a exclusão"));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      titulo={`Excluir vistoria · ${r.placa} · ${dataBR(r.data)}`}
      onFechar={onFechar}
      rodape={
        <>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante="perigo" disabled={salvando} onClick={excluir}>
            <Trash2 size={14} />
            {salvando ? "Excluindo…" : "Excluir vistoria"}
          </Botao>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] leading-relaxed text-slate-600">
          A vistoria de <strong>{r.tecnico}</strong> sai do histórico, do comparativo, do último
          checklist que o técnico vê e do alerta de avaria nova.
        </p>
        <p className="text-[13px] leading-relaxed text-slate-600">
          Ela continua guardada, com seu nome e o motivo. Se for a vistoria errada, você restaura em
          <strong> Ver anuladas</strong>, aqui mesmo no histórico.
        </p>
        <Campo rotulo="Por que está excluindo?">
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="veículo errado, km digitado errado, enviada duas vezes…"
          />
        </Campo>
        {erro && <Aviso>{erro}</Aviso>}
      </div>
    </Modal>
  );
}
