"use client";

import { useCallback, useEffect, useState } from "react";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { itensDoMarco, regrasDoMarco, type Escopo } from "@/lib/frota/escopo";
import { emKm, paraInteiro } from "@/lib/frota/numero";
import {
  Aviso,
  Badge,
  Botao,
  Campo,
  CampoNumero,
  Cartao,
  Carregando,
  Checkbox,
  Confirmar,
  Input,
  Pagina,
  Textarea,
  Vazio,
  cx,
} from "@/components/ui";

// O plano de manutenção preventiva de cada modelo.
//
// Uma regra é "a cada X km, faça isto". O marco da revisão junta todas as
// regras que ele divide: aos 60.000 entram a de 10.000, a de 20.000 e a de
// 30.000, e não entra a de 40.000. É o que permite cada item ter o próprio
// intervalo — a pastilha de freio numa regra de 40.000, o óleo numa de 10.000 —
// sem precisar repetir item nenhum.
//
// Por modelo e não por placa: a frota tem 9 veículos em 5 modelos, e três Kia
// Bongo com o mesmo plano digitado três vezes é uma chance em três de sair
// diferente.

type Veiculo = { placa: string; modelo: string };

/** Os marcos que a prévia simula. Cobre o ciclo de vida da frota sem virar uma
 *  tabela infinita — o que interessa é ver o padrão, não todos os números. */
const MARCOS_PREVIA = [10000, 20000, 30000, 40000, 50000, 60000, 80000, 100000];

export default function EscoposPage() {
  const [escopos, setEscopos] = useState<Escopo[]>([]);
  const [modelos, setModelos] = useState<string[]>([]);
  const [placasPorModelo, setPlacasPorModelo] = useState<Record<string, string[]>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [apagar, setApagar] = useState<Escopo | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const supabase = createClient();
    await supabase.auth.getUser();
    const [e, v] = await Promise.all([
      supabase.from("escopos_manutencao").select("*").order("modelo").order("km_intervalo"),
      supabase.from("veiculos").select("placa, modelo").neq("status", "VENDIDO").order("placa"),
    ]);
    setEscopos((e.data as Escopo[]) ?? []);

    // Os modelos vêm da frota, não de um texto livre: escopo cadastrado para
    // "FIORINO " com espaço no fim nunca casaria com veículo nenhum.
    const veiculos = (v.data as Veiculo[]) ?? [];
    const porModelo: Record<string, string[]> = {};
    for (const x of veiculos) {
      (porModelo[x.modelo] ??= []).push(x.placa);
    }
    setPlacasPorModelo(porModelo);
    setModelos(Object.keys(porModelo).sort());
    setCarregando(false);
  }, []);

  useEffect(() => {
    (async () => {
      await carregar();
    })();
  }, [carregar]);

  async function remover(e: Escopo) {
    setErro(null);
    const supabase = createClient();
    const { error } = await supabase.from("escopos_manutencao").delete().eq("id", e.id);
    if (error) setErro(error.message);
    else await carregar();
  }

  return (
    <Pagina
      titulo="Escopo de manutenção"
      subtitulo="O que a oficina faz em cada revisão preventiva, por modelo — vira a lista impressa na ordem de serviço"
    >
      {erro && <Aviso>{erro}</Aviso>}

      <Cartao className="mb-3 p-4">
        <div className="flex items-start gap-2.5">
          <ListChecks size={18} className="mt-0.5 shrink-0 text-brand-700" />
          <div className="text-[13px] leading-relaxed text-slate-600">
            Cada regra é <b>a cada quantos km</b>, e não <b>em qual km</b>. Uma regra de 20.000
            vale aos 20, 40, 60 e 80 mil. A revisão junta todas as regras que o marco dela divide —
            por isso cada item mora no km que é o intervalo dele: o óleo numa regra de 10.000, a
            pastilha de freio numa de 40.000. Nenhum item precisa ser repetido.
          </div>
        </div>
      </Cartao>

      {carregando ? (
        <Cartao>
          <Carregando />
        </Cartao>
      ) : modelos.length === 0 ? (
        <Vazio
          titulo="Nenhum veículo cadastrado"
          texto="O escopo é por modelo, e os modelos saem da frota. Cadastre um veículo primeiro."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {modelos.map((m) => (
            <BlocoModelo
              key={m}
              modelo={m}
              placas={placasPorModelo[m] ?? []}
              regras={escopos.filter((e) => e.modelo === m)}
              onMudou={carregar}
              onApagar={setApagar}
            />
          ))}
        </div>
      )}

      <Confirmar
        aberto={!!apagar}
        perigo
        confirmarTexto="Apagar"
        titulo="Apagar esta regra?"
        texto={
          apagar
            ? `${apagar.modelo} · a cada ${emKm(apagar.km_intervalo)} · ${apagar.itens.length} item(ns). As ordens de serviço já impressas não mudam.`
            : ""
        }
        onFechar={() => setApagar(null)}
        onConfirmar={() => {
          const alvo = apagar;
          setApagar(null);
          if (alvo) void remover(alvo);
        }}
      />
    </Pagina>
  );
}

function BlocoModelo({
  modelo,
  placas,
  regras,
  onMudou,
  onApagar,
}: {
  modelo: string;
  placas: string[];
  regras: Escopo[];
  onMudou: () => void;
  onApagar: (e: Escopo) => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [km, setKm] = useState("");
  const [itens, setItens] = useState("");
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState(false);

  async function criar(ev: React.FormEvent) {
    ev.preventDefault();
    setErro(null);
    const kmNum = paraInteiro(km);
    if (!kmNum || kmNum <= 0) {
      setErro("Informe de quantos em quantos km esta regra vale.");
      return;
    }
    // Uma linha por serviço: é assim que a oficina lê o papel, e é o que
    // permite não repetir item que já veio de outra regra.
    const lista = itens
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    if (lista.length === 0) {
      setErro("Escreva ao menos um serviço, um por linha.");
      return;
    }
    setSalvando(true);
    const supabase = createClient();
    const { error } = await supabase.from("escopos_manutencao").insert({
      modelo,
      km_intervalo: kmNum,
      itens: lista,
      observacao: obs.trim() || null,
    });
    setSalvando(false);
    if (error) {
      setErro(
        error.code === "23505"
          ? `Já existe uma regra de ${emKm(kmNum)} para ${modelo}. Edite a que existe em vez de criar outra.`
          : error.message,
      );
      return;
    }
    setKm("");
    setItens("");
    setObs("");
    setAbrindo(false);
    onMudou();
  }

  return (
    <Cartao
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          {modelo}
          <span className="text-[11.5px] font-normal text-slate-500">
            {placas.join(" · ")}
          </span>
        </span>
      }
      acoes={
        <div className="flex flex-wrap gap-2">
          {regras.length > 0 && (
            <Botao tamanho="sm" onClick={() => setPrevia((v) => !v)}>
              {previa ? "Fechar prévia" : "Ver por revisão"}
            </Botao>
          )}
          <Botao tamanho="sm" variante="primario" onClick={() => setAbrindo((v) => !v)}>
            {abrindo ? "Fechar" : (
              <>
                <Plus size={13} />
                Nova regra
              </>
            )}
          </Botao>
        </div>
      }
    >
      {abrindo && (
        <form onSubmit={criar} className="border-b border-slate-100 bg-slate-50/60 p-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <CampoNumero
              rotulo="A cada quantos km"
              unidade="km"
              valor={km}
              onValor={setKm}
              dica="20.000 vale aos 20, 40, 60…"
            />
            <Campo rotulo="Observação (opcional)" className="sm:col-span-2">
              <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex.: usar óleo 5W30" />
            </Campo>
          </div>
          <Campo rotulo="Serviços — um por linha" className="mt-2.5">
            <Textarea
              rows={4}
              value={itens}
              onChange={(e) => setItens(e.target.value)}
              placeholder={"Trocar óleo\nTrocar filtro de óleo\nAlinhamento"}
            />
          </Campo>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Botao type="submit" variante="sucesso" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar regra"}
            </Botao>
            {erro && <Aviso>{erro}</Aviso>}
          </div>
        </form>
      )}

      {regras.length === 0 ? (
        <div className="px-4 py-6 text-center text-[13px] text-slate-500">
          Nenhuma regra para {modelo}. A preventiva deste modelo sai sem lista de serviços.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {regras.map((r) => (
            <Regra key={r.id} r={r} onMudou={onMudou} onApagar={onApagar} />
          ))}
        </div>
      )}

      {previa && regras.length > 0 && (
        <div className="border-t border-slate-100 bg-slate-50/60 p-4">
          <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-500">
            O que sai na ordem de serviço em cada revisão
          </div>
          <div className="rolagem-fina overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="whitespace-nowrap">Revisão</th>
                  <th>Serviços</th>
                </tr>
              </thead>
              <tbody>
                {MARCOS_PREVIA.map((marco) => {
                  const lista = itensDoMarco(regras, marco);
                  const quais = regrasDoMarco(regras, marco);
                  return (
                    <tr key={marco}>
                      <td className="whitespace-nowrap font-semibold tabular-nums">{emKm(marco)}</td>
                      <td>
                        {lista.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1.5">
                            {lista.map((i) => (
                              <Badge key={i}>{i}</Badge>
                            ))}
                            <span className="text-[11px] text-slate-400">
                              (regras de {quais.map((q) => emKm(q.km_intervalo)).join(", ")})
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Cartao>
  );
}

function Regra({
  r,
  onMudou,
  onApagar,
}: {
  r: Escopo;
  onMudou: () => void;
  onApagar: (e: Escopo) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [itens, setItens] = useState(r.itens.join("\n"));
  const [obs, setObs] = useState(r.observacao ?? "");
  const [ativo, setAtivo] = useState(r.ativo);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const supabase = createClient();
    await supabase
      .from("escopos_manutencao")
      .update({
        itens: itens.split("\n").map((x) => x.trim()).filter(Boolean),
        observacao: obs.trim() || null,
        ativo,
      })
      .eq("id", r.id);
    setSalvando(false);
    setEditando(false);
    onMudou();
  }

  return (
    <div className={cx("p-4", !r.ativo && "bg-slate-50/60")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-bold tabular-nums text-slate-900">
          a cada {emKm(r.km_intervalo)}
        </span>
        {!r.ativo && <Badge tom="mudo">DESLIGADA</Badge>}
        <span className="text-[12px] text-slate-500">
          {r.itens.length} serviço(s) · vale aos {[1, 2, 3].map((n) => emKm(r.km_intervalo * n)).join(", ")}…
        </span>
        <div className="ml-auto flex gap-2">
          <Botao tamanho="sm" onClick={() => setEditando((v) => !v)}>
            {editando ? "Fechar" : "Editar"}
          </Botao>
          <Botao tamanho="sm" variante="perigo" onClick={() => onApagar(r)}>
            <Trash2 size={13} />
          </Botao>
        </div>
      </div>

      {!editando ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {r.itens.map((i) => (
              <Badge key={i} tom="info">
                {i}
              </Badge>
            ))}
          </div>
          {r.observacao && (
            <div className="mt-1.5 text-[12px] text-slate-500">{r.observacao}</div>
          )}
        </>
      ) : (
        <div className="mt-3">
          <Campo rotulo="Serviços — um por linha">
            <Textarea rows={4} value={itens} onChange={(e) => setItens(e.target.value)} />
          </Campo>
          <Campo rotulo="Observação" className="mt-2.5">
            <Input value={obs} onChange={(e) => setObs(e.target.value)} />
          </Campo>
          <label className="mt-2.5 flex items-center gap-2 text-[13px] text-slate-700">
            <Checkbox checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Regra ativa
          </label>
          <div className="mt-3">
            <Botao variante="primario" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
