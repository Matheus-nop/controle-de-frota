"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avariasDe, resumoDaAvaria, type Avaria } from "@/lib/frota/avarias";
import { emKm, paraInteiro } from "@/lib/frota/numero";
import { dataBR, hojeBR } from "@/lib/frota/tempo";
import { enviarFoto, enviarFotos } from "@/lib/frota/foto";
import { mensagemDeErro } from "@/lib/frota/erro";
import {
  Aviso,
  Badge,
  Botao,
  BotaoLink,
  Campo,
  CampoFoto,
  CampoFotos,
  CampoNumero,
  Cartao,
  Carregando,
  Input,
  Pagina,
  Select,
  cx,
} from "@/components/ui";

type Veiculo = { id: string; placa: string; modelo: string; status: string };
type Tecnico = { id: string; nome: string };

/** Uma avaria enquanto está sendo digitada. Vira `Avaria` só na hora de salvar,
 *  quando as fotos já subiram e viraram URL. */
type AvariaForm = { onde: string; tipo: string; existia: string; desc: string; fotos: File[] };

const AVARIA_VAZIA: AvariaForm = { onde: "", tipo: "", existia: "", desc: "", fotos: [] };

/** O checklist anterior do mesmo veículo, para o técnico conferir antes de
 *  registrar. Sem isto ele redigita a mesma avaria toda semana, ou deixa de
 *  registrar achando que já está lá. */
type Anterior = {
  data: string;
  km_atual: number | null;
  apto: boolean;
  tecnico: string | null;
  avarias: Avaria[];
};

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

/**
 * As cinco fotos da vistoria semanal, na ordem em que se anda em volta do
 * veículo: frente, lado esquerdo, lado atrás, lado direito — e por último o
 * painel, que é dentro.
 *
 * Ter ângulo nomeado não é só organização. É o que permite comparar a traseira
 * de hoje com a traseira da semana passada, em vez de comparar traseira com
 * lateral e não concluir nada.
 */
const ANGULOS: [string, string, string][] = [
  ["frontal", "Frontal", "A frente inteira, com a placa visível."],
  ["lateral_esquerda", "Lateral esquerda", "Do lado do motorista, o veículo inteiro."],
  ["lateral_direita", "Lateral direita", "Do lado do passageiro, o veículo inteiro."],
  ["traseira", "Traseira", "A traseira inteira, com a placa visível."],
  ["painel", "Painel", "Com o hodômetro legível — é o km desta vistoria."],
];

const AVARIA_ONDE = ["FRENTE", "TRASEIRA", "LATERAL DIREITA", "LATERAL ESQUERDA", "INTERIOR", "RODAS/PNEUS", "OUTRO"];
const AVARIA_TIPO = ["AMASSADO", "ARRANHÃO", "QUEBRA", "LANTERNA/FAROL", "PNEU", "RETROVISOR", "OUTRO"];
const AVARIA_EXISTIA = ["NÃO, É NOVA", "SIM, JÁ EXISTIA", "NÃO SEI INFORMAR"];
const MOTIVOS = ["PNEU", "FREIO", "MOTOR", "ELÉTRICA", "LUZ DE PAINEL", "BARULHO", "VIDRO", "AR CONDICIONADO", "AVARIA GRAVE", "DOCUMENTO", "OUTROS"];
const URGENCIAS = ["BAIXA", "MÉDIA", "ALTA", "EMERGENCIAL"];

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

/**
 * O que a última vistoria deste veículo encontrou.
 *
 * Existe para o técnico não ter que "mencionar" de novo o que já está
 * registrado. Antes, sem ver o anterior, ou ele redigitava o mesmo amassado
 * toda semana — e o histórico virava uma pilha de avarias repetidas que ninguém
 * conseguia contar — ou deixava de registrar achando que já estava lá.
 *
 * Fica fora do componente da página: definido dentro, o React o remontaria a
 * cada tecla digitada em qualquer campo.
 */
function UltimoChecklist({ a }: { a: Anterior }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-bold text-slate-800">Última vistoria deste veículo</span>
        <Badge tom={a.apto ? "ok" : "critico"}>{a.apto ? "APTO" : "NÃO APTO"}</Badge>
      </div>
      <div className="mt-1 text-[12px] text-slate-600">
        {dataBR(a.data)}
        {a.tecnico ? ` · por ${a.tecnico}` : ""}
        {a.km_atual != null ? ` · ${emKm(a.km_atual)}` : ""}
      </div>

      {a.avarias.length === 0 ? (
        <p className="mt-2 text-[12.5px] text-slate-500">
          Nenhuma avaria registrada. Se encontrar alguma agora, ela é nova.
        </p>
      ) : (
        <>
          <p className="mt-2.5 text-[12.5px] font-semibold text-slate-700">
            {a.avarias.length === 1
              ? "1 avaria já registrada — não precisa repetir:"
              : `${a.avarias.length} avarias já registradas — não precisa repetir:`}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {a.avarias.map((av, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-[12.5px] text-slate-700">
                <span className="font-semibold">{resumoDaAvaria(av)}</span>
                {av.reclassificada_por && (
                  <span className="text-[11px] text-slate-500">marcada pelo gestor</span>
                )}
                {av.descricao && <span className="text-slate-500">{av.descricao}</span>}
                {av.fotos.map((u, k) => (
                  <a
                    key={k}
                    href={u}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11.5px] font-medium text-brand-700 hover:underline"
                  >
                    foto {k + 1}
                  </a>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
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
  // Uma vistoria pode encontrar mais de um dano. Antes cabia um só, e o segundo
  // virava texto solto na descrição — o que impedia comparar uma semana com a
  // outra, que é o que a equipe pediu.
  const [avarias, setAvarias] = useState<AvariaForm[]>([]);
  const [anterior, setAnterior] = useState<Anterior | null>(null);

  const [apto, setApto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [motivoDesc, setMotivoDesc] = useState("");
  const [urgencia, setUrgencia] = useState("");
  const [fotoBloqueio, setFotoBloqueio] = useState<File[]>([]);

  // Uma vaga por ângulo. Antes era um `<input multiple>` só, e o técnico da
  // Saveiro descobriu do pior jeito que escolher uma foto de cada vez
  // SUBSTITUÍA a anterior: cinco cliques, uma foto no banco.
  const [fotosAngulo, setFotosAngulo] = useState<Record<string, File | null>>({});

  const [salvando, setSalvando] = useState(false);
  // Quantas fotos já subiram. Envio de cinco fotos num 4G fraco demora, e botão
  // parado escrito "Enviando…" faz o técnico achar que travou e recarregar a
  // página no meio — perdendo o formulário inteiro.
  const [enviadas, setEnviadas] = useState(0);
  const [totalFotos, setTotalFotos] = useState(0);
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

  // O checklist anterior do veículo escolhido. Busca a cada troca de veículo, e
  // não de uma vez no começo: são 9 veículos, mas cada vistoria olha um só.
  useEffect(() => {
    let valeu = true;
    (async () => {
      // A limpeza também vai para dentro do callback: mexer no estado direto no
      // corpo do efeito dispara render em cascata, e o lint do projeto barra.
      if (!veiculoId) {
        if (valeu) setAnterior(null);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase
        .from("checklists")
        .select("data, km_atual, apto, itens, tecnico:tecnico_id(nome)")
        .eq("veiculo_id", veiculoId)
        .order("data", { ascending: false })
        .limit(1);
      if (!valeu) return;
      const c = (data ?? [])[0] as
        | { data: string; km_atual: number | null; apto: boolean; itens: unknown; tecnico: { nome: string } | { nome: string }[] | null }
        | undefined;
      if (!c) {
        setAnterior(null);
        return;
      }
      const t = Array.isArray(c.tecnico) ? c.tecnico[0] : c.tecnico;
      setAnterior({
        data: c.data,
        km_atual: c.km_atual,
        apto: c.apto,
        tecnico: t?.nome ?? null,
        avarias: avariasDe(c.itens),
      });
    })();
    // A vistoria seguinte pode trocar de veículo antes desta resposta chegar.
    return () => {
      valeu = false;
    };
  }, [veiculoId]);

  const respondidas = ITENS_RAPIDO.filter(([k]) => rapido[k]).length;

  function mudarAvaria(i: number, campo: keyof AvariaForm, valor: string | File[]) {
    setAvarias((lista) => lista.map((a, k) => (k === i ? { ...a, [campo]: valor } : a)));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!condutorId || !veiculoId || !km || !apto) {
      setErro("Preencha condutor, veículo, km e se o veículo está apto.");
      return;
    }
    // O campo é de texto (para entender `66.402`), então "preenchido" não
    // quer mais dizer "numérico" — quem confere isso agora somos nós, e não
    // o `type=number` do navegador.
    const kmNum = paraInteiro(km);
    if (kmNum == null) {
      setErro("O km atual precisa ser um número. Confira o hodômetro.");
      return;
    }
    // Nomeia o que falta. "As fotos são obrigatórias" faz a pessoa reler o
    // formulário inteiro procurando o que esqueceu.
    const faltando = ANGULOS.filter(([chave]) => !fotosAngulo[chave]).map(([, rotulo]) => rotulo);
    if (faltando.length > 0) {
      setErro(
        faltando.length === 1
          ? `Falta a foto ${faltando[0].toLowerCase()}.`
          : `Faltam as fotos: ${faltando.join(", ").toLowerCase()}.`,
      );
      return;
    }
    if (apto === "NÃO" && (!motivo || fotoBloqueio.length === 0)) {
      setErro("Veículo não apto: informe o motivo do bloqueio e a foto obrigatória.");
      return;
    }

    // Avaria marcada como SIM tem que ter ao menos uma preenchida: senão o
    // checklist diz "tem dano" e não diz qual, que é pior do que dizer NÃO.
    const listaAvarias = novaAvaria === "SIM" ? avarias.filter((a) => a.onde || a.tipo || a.desc.trim() || a.fotos.length) : [];
    if (novaAvaria === "SIM" && listaAvarias.length === 0) {
      setErro("Você marcou que há avaria nova: descreva ao menos uma, ou responda NÃO.");
      return;
    }

    setSalvando(true);
    const doBloqueio = apto === "NÃO" ? fotoBloqueio : [];
    setEnviadas(0);
    setTotalFotos(
      ANGULOS.filter(([chave]) => fotosAngulo[chave]).length +
        doBloqueio.length +
        listaAvarias.reduce((n, a) => n + a.fotos.length, 0),
    );
    const contar = () => setEnviadas((n) => n + 1);
    try {
      const supabase = createClient();
      // Cada ângulo sobe no próprio caminho, e o nome do arquivo no Storage já
      // diz qual é — quem for olhar o balde por fora entende sem consultar nada.
      //
      // Uma foto de cada vez, e não as cinco de uma: foi o envio simultâneo que
      // derrubou o primeiro checklist guiado do campo com "Failed to fetch".
      // Cinco fotos de celular somam dezenas de MB, e em fila cada uma tem a
      // banda inteira — além de o contador andar na tela enquanto isso.
      const subidas: { chave: string; url: string | null }[] = [];
      for (const [chave] of ANGULOS) {
        const arquivo = fotosAngulo[chave];
        const url = await enviarFoto(supabase, "checklists", `${veiculoId}/${chave}`, arquivo);
        if (arquivo) contar();
        subidas.push({ chave, url });
      }
      const fBloqueio = await enviarFotos(
        supabase,
        "checklists",
        `${veiculoId}/bloqueio`,
        doBloqueio,
        contar,
      );

      // `fotos_semanais` continua sendo a lista achatada, na ordem dos ângulos:
      // é o que o histórico, o comparativo e a reclassificação já leem. O mapa
      // `angulos` vem ao lado, só para dar nome a cada uma — assim nada quebra
      // e a informação nova não se perde.
      const fSemanais = subidas.map((e) => e.url).filter((u): u is string => !!u);
      const angulos: Record<string, string> = {};
      for (const e of subidas) if (e.url) angulos[e.url] = e.chave;

      // Cada avaria sobe as suas fotos no próprio prefixo. O índice entra no
      // caminho para duas avarias da mesma vistoria não se misturarem no balde.
      const avariasGravadas = [];
      for (const [i, a] of listaAvarias.entries()) {
        avariasGravadas.push({
          onde: a.onde || null,
          tipo: a.tipo || null,
          ja_existia: a.existia || null,
          descricao: a.desc.trim() || null,
          fotos: await enviarFotos(supabase, "checklists", `${veiculoId}/avaria-${i + 1}`, a.fotos, contar),
        });
      }

      const itens = {
        usado_por_outro: usadoOutro || null,
        checklist: rapido,
        nova_avaria: novaAvaria,
        // `avarias` no plural. O singular continua sendo lido em
        // `lib/frota/avarias.ts`, para as vistorias antigas não sumirem.
        avarias: avariasGravadas,
        fotos_semanais: fSemanais,
        angulos,
        fotos_bloqueio: fBloqueio,
      };

      const { error } = await supabase.from("checklists").insert({
        veiculo_id: veiculoId,
        tecnico_id: condutorId,
        data: data || hojeBR(),
        km_atual: kmNum,
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
      setErro(mensagemDeErro(err, "o envio do checklist"));
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

              {/* A vistoria anterior deste veículo.
                  Aparece antes do km de propósito: é o número que a pessoa vai
                  digitar em seguida, e o de antes serve de referência.
                  A lista de avarias é o ponto: o técnico não precisa redigitar o
                  amassado que já está registrado — só o que for novo. */}
              {anterior && <UltimoChecklist a={anterior} />}

              <CampoNumero
                rotulo="Km atual"
                unidade="km"
                required
                valor={km}
                onValor={setKm}
                placeholder="ex.: 66402"
              />

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
                <SimNao
                  valor={novaAvaria}
                  onEscolher={(v) => {
                    setNovaAvaria(v);
                    // SIM já abre a primeira ficha: marcar e não ter onde
                    // escrever é o tipo de tela que faz desistir no meio.
                    setAvarias(v === "SIM" ? (l) => (l.length ? l : [{ ...AVARIA_VAZIA }]) : []);
                  }}
                />
              </div>

              {novaAvaria === "SIM" && (
                <div className="space-y-3">
                  {avarias.map((a, i) => (
                    <div
                      key={i}
                      className="space-y-3.5 rounded-lg bg-amber-50/60 p-3.5 ring-1 ring-inset ring-amber-200"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-amber-900">
                          Avaria {i + 1} de {avarias.length}
                        </span>
                        {avarias.length > 1 && (
                          <Botao
                            type="button"
                            tamanho="sm"
                            variante="perigo"
                            onClick={() => setAvarias((l) => l.filter((_, k) => k !== i))}
                          >
                            <Trash2 size={13} />
                            Remover
                          </Botao>
                        )}
                      </div>
                      <Campo rotulo="Onde?">
                        <Select value={a.onde} onChange={(e) => mudarAvaria(i, "onde", e.target.value)}>
                          <option value="">Selecione…</option>
                          {AVARIA_ONDE.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </Select>
                      </Campo>
                      <Campo rotulo="Tipo de avaria">
                        <Select value={a.tipo} onChange={(e) => mudarAvaria(i, "tipo", e.target.value)}>
                          <option value="">Selecione…</option>
                          {AVARIA_TIPO.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </Select>
                      </Campo>
                      <Campo rotulo="A avaria já existia?">
                        <Select value={a.existia} onChange={(e) => mudarAvaria(i, "existia", e.target.value)}>
                          <option value="">Selecione…</option>
                          {AVARIA_EXISTIA.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </Select>
                      </Campo>
                      <Campo rotulo="Descreva rapidamente">
                        <Input
                          type="text"
                          value={a.desc}
                          onChange={(e) => mudarAvaria(i, "desc", e.target.value)}
                        />
                      </Campo>
                      <CampoFotos
                        rotulo="Fotos da avaria"
                        dica="De perto e de longe. Pode escolher uma de cada vez — elas somam."
                        arquivos={a.fotos}
                        onArquivos={(f) => mudarAvaria(i, "fotos", f)}
                      />
                    </div>
                  ))}
                  {/* Uma vistoria acha dois amassados e um farol quebrado no
                      mesmo dia. Cada um é um registro, senão não dá para dizer
                      na semana seguinte quantos havia. */}
                  <Botao type="button" onClick={() => setAvarias((l) => [...l, { ...AVARIA_VAZIA }])}>
                    <Plus size={14} />
                    Adicionar outra avaria
                  </Botao>
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
                  <CampoFotos
                    rotulo="Foto obrigatória do problema"
                    dica="Pode escolher uma de cada vez — elas somam."
                    arquivos={fotoBloqueio}
                    onArquivos={setFotoBloqueio}
                  />
                </div>
              )}
            </div>
          </Cartao>

          <Cartao
            titulo={`5 · Fotos do veículo (${Object.values(fotosAngulo).filter(Boolean).length} de ${ANGULOS.length})`}
          >
            <div className="space-y-2.5 p-4">
              <p className="text-[12.5px] leading-relaxed text-slate-500">
                Uma foto para cada lado, na ordem de quem anda em volta do veículo. Cada vaga
                guarda uma foto — se tirar de novo, substitui só aquela.
              </p>
              {ANGULOS.map(([chave, rotulo, dica]) => (
                <CampoFoto
                  key={chave}
                  rotulo={rotulo}
                  dica={dica}
                  obrigatoria
                  arquivo={fotosAngulo[chave] ?? null}
                  onArquivo={(f) => setFotosAngulo((p) => ({ ...p, [chave]: f }))}
                />
              ))}
            </div>
          </Cartao>

          <Botao type="submit" variante="primario" tamanho="lg" disabled={salvando} className="w-full">
            {salvando
              ? totalFotos > 0
                ? `Enviando foto ${Math.min(enviadas + 1, totalFotos)} de ${totalFotos}…`
                : "Enviando…"
              : "Enviar checklist"}
          </Botao>

          {erro && <Aviso>{erro}</Aviso>}
        </form>
      )}
    </Pagina>
  );
}
