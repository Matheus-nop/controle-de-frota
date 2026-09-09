"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { periodoPadrao } from "@/lib/frota/tempo";
import {
  Aviso,
  Badge,
  Botao,
  Campo,
  Cartao,
  Carregando,
  Contador,
  Input,
  Pagina,
  Placa,
  Select,
  Vazio,
  cx,
} from "@/components/ui";

// Conferência de ponto: os horários que a equipe registrou, para bater com a
// marcação da folha.
//
// A leitura é por dia, que é como a folha é conferida de verdade: fecha um dia,
// confere, passa para o próximo.
//
// A tela é de leitura e não tem km nem custo — quem confere ponto não precisa
// do custo da frota, e o que não aparece não vaza. Quem entra aqui é o papel
// PONTO (e o gestor); a RLS de `roteiros` é quem garante isso de verdade.
//
// Tudo que é hora vem pronto da view v_conferencia_ponto, já no fuso de São
// Paulo. Nenhuma conta de horário acontece nesta tela — a lição do bug de fuso
// de agosto foi essa: hora se calcula num lugar só.

type Linha = {
  id: string;
  dia: string; // YYYY-MM-DD, o dia da saída em São Paulo
  placa: string;
  modelo: string;
  tecnico_saida: string;
  tecnico_chegada: string | null;
  hora_saida: string | null; // HH:MM:SS
  hora_chegada: string | null;
  duracao_min: number | null;
  virou_o_dia: boolean;
  dia_chegada: string | null;
  em_aberto: boolean;
};

function hhmm(t: string | null) {
  return t ? t.slice(0, 5) : "—";
}

function duracao(min: number | null) {
  if (min == null || min < 0) return "—";
  const h = Math.floor(min / 60);
  return h > 0 ? `${h}h${String(min % 60).padStart(2, "0")}` : `${min}min`;
}

function dataBR(s: string | null) {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—";
}

// "quinta-feira" a partir de "2026-09-04". Meio-dia de propósito: data pura
// vira UTC no parser e o dia recuaria três horas.
const fmtDiaSemana = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
function diaSemana(dia: string) {
  return fmtDiaSemana.format(new Date(dia + "T12:00:00"));
}

export default function PontoPage() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [de, setDe] = useState(() => periodoPadrao(15).de);
  const [ate, setAte] = useState(() => periodoPadrao(15).ate);
  const [tecnico, setTecnico] = useState("");

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const supabase = createClient();
    // O refresh do token corre em paralelo com a query e devolve 401 se a
    // query sair primeiro; getUser() espera o token ficar bom.
    await supabase.auth.getUser();

    // `dia` já é a data local calculada na view — filtro direto, sem a
    // conversão de janela UTC que /historico precisa fazer sobre timestamptz.
    const { data, error } = await supabase
      .from("v_conferencia_ponto")
      .select("*")
      .gte("dia", de)
      .lte("dia", ate)
      .order("dia", { ascending: false })
      .order("hora_saida", { ascending: true });

    if (error) setErro(error.message);
    setLinhas((data as Linha[]) ?? []);
    setCarregando(false);
  }, [de, ate]);

  useEffect(() => {
    (async () => {
      await buscar();
    })();
  }, [buscar]);

  const tecnicos = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.tecnico_saida))).sort(),
    [linhas],
  );
  const visiveis = useMemo(
    () => (tecnico ? linhas.filter((l) => l.tecnico_saida === tecnico) : linhas),
    [linhas, tecnico],
  );

  // Um bloco por dia. É assim que a folha é conferida: fecha um dia, confere,
  // passa para o próximo.
  const dias = useMemo(() => {
    const porDia = new Map<string, Linha[]>();
    for (const l of visiveis) {
      const lista = porDia.get(l.dia) ?? [];
      lista.push(l);
      porDia.set(l.dia, lista);
    }
    return [...porDia.entries()].map(([dia, lista]) => ({
      dia,
      lista,
      minutos: lista.reduce((s, l) => s + (l.duracao_min ?? 0), 0),
      abertos: lista.filter((l) => l.em_aberto).length,
    }));
  }, [visiveis]);

  const emAberto = visiveis.filter((l) => l.em_aberto).length;
  const viraram = visiveis.filter((l) => l.virou_o_dia).length;
  const totalMin = visiveis.reduce((s, l) => s + (l.duracao_min ?? 0), 0);

  function baixarCSV() {
    const cab = ["dia", "placa", "veiculo", "tecnico_saida", "tecnico_chegada",
      "hora_saida", "hora_chegada", "dia_chegada", "duracao", "virou_o_dia", "situacao"];
    const linhasCsv = [cab];
    visiveis.forEach((l) =>
      linhasCsv.push([
        l.dia, l.placa, l.modelo, l.tecnico_saida, l.tecnico_chegada ?? "",
        hhmm(l.hora_saida), hhmm(l.hora_chegada), l.dia_chegada ?? "",
        duracao(l.duracao_min), l.virou_o_dia ? "sim" : "não",
        l.em_aberto ? "sem chegada registrada" : "fechado",
      ]),
    );
    const csv = linhasCsv
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    // BOM na frente: sem ele o Excel abre "JOÃO" como "JOÃO".
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `conferencia-ponto-${de}-a-${ate}.csv`;
    a.click();
  }

  return (
    <Pagina
      titulo="Conferência de ponto"
      subtitulo={`${visiveis.length} roteiro(s) no período`}
      acoes={
        <Botao onClick={baixarCSV} disabled={visiveis.length === 0}>
          <Download size={14} />
          Baixar CSV
        </Botao>
      }
    >
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Contador rotulo="Roteiros" valor={visiveis.length} legenda="no período escolhido" />
        <Contador rotulo="Tempo somado" valor={duracao(totalMin)} legenda="só os roteiros fechados" />
        <Contador
          rotulo="Sem chegada"
          valor={emAberto}
          legenda={emAberto > 0 ? "confirmar com o técnico" : "tudo fechado"}
          tom={emAberto > 0 ? "text-amber-600" : "text-slate-900"}
        />
        <Contador rotulo="Viraram o dia" valor={viraram} legenda="ponto em dois dias" />
      </div>

      <Cartao className="my-3 p-3.5">
        <div className="flex flex-wrap items-end gap-2.5">
          <Campo rotulo="De" className="min-w-[140px] flex-1">
            <Input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} />
          </Campo>
          <Campo rotulo="Até" className="min-w-[140px] flex-1">
            <Input type="date" value={ate} min={de} onChange={(e) => setAte(e.target.value)} />
          </Campo>
          <Campo rotulo="Técnico" className="min-w-[160px] flex-[2]">
            <Select value={tecnico} onChange={(e) => setTecnico(e.target.value)}>
              <option value="">Todos</option>
              {tecnicos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Campo>
        </div>
      </Cartao>

      {erro && <Aviso>{erro}</Aviso>}

      {carregando && (
        <Cartao>
          <Carregando />
        </Cartao>
      )}

      {!carregando && dias.length === 0 && !erro && (
        <Vazio titulo="Nenhum roteiro no período escolhido." />
      )}

      {dias.map(({ dia, lista, minutos, abertos }) => (
        <section key={dia} className="mb-6">
          <div className="mb-2.5 flex flex-wrap items-baseline gap-2.5 border-b border-slate-200 pb-2">
            <span className="text-[15px] font-bold tabular-nums text-slate-900">{dataBR(dia)}</span>
            <span className="text-[12.5px] capitalize text-slate-500">{diaSemana(dia)}</span>
            <span className="ml-auto text-[11.5px] tabular-nums text-slate-400">
              {lista.length} roteiro(s) · {duracao(minutos)}
              {abertos > 0 ? ` · ${abertos} sem chegada` : ""}
            </span>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-3">
            {lista.map((l) => (
              <Cartao
                key={l.id}
                className={cx(
                  "border-l-4 p-3.5",
                  l.em_aberto ? "border-l-amber-500 bg-amber-50/40" : "border-l-emerald-600",
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Placa>{l.placa}</Placa>
                  <span className="text-[12px] text-slate-500">{l.modelo}</span>
                  {l.em_aberto && (
                    <Badge tom="atencao" className="ml-auto">
                      sem chegada
                    </Badge>
                  )}
                  {l.virou_o_dia && (
                    <Badge tom="ok" className="ml-auto">
                      virou o dia
                    </Badge>
                  )}
                </div>

                <div className="text-sm font-semibold text-slate-900">{l.tecnico_saida}</div>
                {l.tecnico_chegada && l.tecnico_chegada !== l.tecnico_saida && (
                  <div className="mt-0.5 text-[11.5px] text-slate-500">
                    voltou com {l.tecnico_chegada}
                  </div>
                )}

                <div className="mt-3 flex items-end gap-3 border-t border-slate-100 pt-3">
                  <Hora rotulo="Saída" valor={hhmm(l.hora_saida)} />
                  <ArrowRight size={13} className="mb-1 shrink-0 text-slate-300" />
                  <Hora rotulo="Chegada" valor={hhmm(l.hora_chegada)} />
                  <div className="ml-auto text-right">
                    <div className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-slate-400">
                      Tempo fora
                    </div>
                    <div className="text-[15px] font-bold leading-none tabular-nums text-slate-600">
                      {duracao(l.duracao_min)}
                    </div>
                  </div>
                </div>

                {(l.em_aberto || l.virou_o_dia) && (
                  <p className="mt-2.5 rounded-md bg-slate-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-slate-600">
                    {l.em_aberto
                      ? "O técnico não registrou a chegada. O horário de volta não existe — não é zero."
                      : `Voltou em ${dataBR(l.dia_chegada)}: o ponto dessa pessoa cai em dois dias.`}
                  </p>
                )}
              </Cartao>
            ))}
          </div>
        </section>
      ))}

      {dias.length > 0 && (
        <p className="mt-6 text-center text-[12px] text-slate-400">
          Os horários são os que a equipe registrou ao sair e ao voltar, no fuso de São Paulo.
        </p>
      )}
    </Pagina>
  );
}

function Hora({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.07em] text-slate-400">{rotulo}</div>
      <div className="text-[17px] font-bold leading-none tabular-nums text-slate-900">{valor}</div>
    </div>
  );
}
