"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BotaoLink, Carregando } from "@/components/ui";
import {
  Assinaturas,
  Caixa,
  Caixas,
  FaixaDoTitulo,
  FolhaA4,
  ParaPreencher,
  QuadroDePares,
  RodapeDaFolha,
  Secao,
  TABELA_DOC,
  TDC,
  THC,
} from "@/components/folha-a4";
import { emReais } from "@/lib/frota/numero";
import { ITENS_LAVAGEM, ITENS_LIMPEZA, TIPO_LAVAGEM } from "@/lib/frota/limpeza";
import { dataBR, nomeDoMes } from "@/lib/frota/tempo";

// O formulário da lavagem mensal, para imprimir e mandar com o veículo.
//
// Existe porque a lavagem vinha usando a ordem de serviço da oficina: o
// lava-jato recebia uma folha pedindo "peças substituídas", "km na entrega" e
// "próxima revisão em 40.000 km". Nada disso tem a ver com lavar um carro, e
// um papel que pergunta o que não se aplica ensina quem o recebe a ignorá-lo.
//
// O que ele pede é o que uma lavagem tem: o escopo item por item para o
// lava-jato marcar, o horário de entrada e saída, o valor e a nota — e, na
// volta, a conferência da expedição nos mesmos sete itens do checklist de
// limpeza semanal, que é quem diz se o serviço pode ser pago.
//
// Fica FORA do route group `(app)`: a casca do app (topo, abas, menu) não tem o
// que fazer numa folha A4. Nada aqui grava nada — quem lança o valor e a nota é
// o gestor/PCM em /manutencao. O papel é o caminho de ida.

type Veic = { placa: string; modelo: string; ano: string | null };
type Lavagem = {
  id: string;
  tipo: string | null;
  status: string;
  aberta_em: string | null;
  agendada_para: string | null;
  concluida_em: string | null;
  oficina: string | null;
  orcamento: number | null;
  valor_final: number | null;
  descricao_problema: string;
  veiculo: Veic | Veic[] | null;
  responsavel: { nome: string } | { nome: string }[] | null;
};

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

// No papel, o que ainda não existe vira linha para escrever à mão — é o único
// motivo de a formatação daqui não ser a de tela, que mostra "—".
const LINHA = "____________";
const dia = (s: string | null) => {
  const d = dataBR(s);
  return d === "—" ? LINHA : d;
};
// Nº do formulário: os 8 primeiros do uuid, em maiúsculas. Curto o bastante
// para alguém ditar no telefone e ainda achar a lavagem certa.
function numero(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function Formulario() {
  const params = useSearchParams();
  const id = params.get("id");
  const [m, setM] = useState<Lavagem | null>(null);
  const [estado, setEstado] = useState<"carregando" | "ok" | "vazio">("carregando");

  useEffect(() => {
    (async () => {
      if (!id) {
        setEstado("vazio");
        return;
      }
      const supabase = createClient();
      await supabase.auth.getUser();
      const { data } = await supabase
        .from("manutencoes")
        .select(
          "id, tipo, status, aberta_em, agendada_para, concluida_em, oficina, orcamento, valor_final, descricao_problema, veiculo:veiculo_id(placa,modelo,ano), responsavel:responsavel_id(nome)",
        )
        .eq("id", id)
        .maybeSingle();
      setM((data as Lavagem) ?? null);
      setEstado(data ? "ok" : "vazio");
    })();
  }, [id]);

  if (estado === "carregando") return <Carregando texto="Carregando a lavagem…" />;

  if (!m) {
    return (
      <div className="mx-auto max-w-[820px] p-6">
        <p className="mb-3 text-sm text-slate-500">
          {id ? "Lavagem não encontrada." : "Nenhuma lavagem indicada no endereço."}
        </p>
        <BotaoLink href="/manutencao">Voltar para Manutenções</BotaoLink>
      </div>
    );
  }

  const v = one(m.veiculo);
  const resp = one(m.responsavel);
  // O mês de referência é o da lavagem, não o de hoje: um formulário reimpresso
  // em novembro para a lavagem de outubro continua sendo de outubro.
  const quando = m.concluida_em ?? m.agendada_para ?? m.aberta_em;
  // A observação só vira seção quando diz algo. O texto padrão que a tela de
  // manutenção grava ao programar o mês não precisa ser impresso de volta.
  const recado = m.descricao_problema?.trim();

  return (
    <FolhaA4>
      <FaixaDoTitulo
        sobre={quando ? `Lavagem mensal · ${nomeDoMes(quando)}` : "Lavagem mensal"}
        titulo="Formulário de lavagem"
        linha={`${v?.placa ?? "—"} · ${v?.modelo ?? "—"} · ${m.oficina ?? "lava-jato a definir"}`}
        rotuloDoNumero="Formulário nº"
        numero={numero(m.id)}
        data={m.concluida_em ? `lavada em ${dia(m.concluida_em)}` : `prevista para ${dia(m.agendada_para)}`}
      />

      {m.tipo !== TIPO_LAVAGEM && (
        // Chegar aqui por endereço digitado à mão é possível. Dizer em vez de
        // imprimir uma manutenção mecânica num papel que não a cabe.
        <p className="mt-3 break-inside-avoid border-2 border-slate-900 px-3.5 py-2 text-[11px] leading-relaxed text-slate-900">
          <b>Atenção:</b> esta manutenção é do tipo <b>{m.tipo ?? "—"}</b>, e não LAVAGEM. Para serviço de oficina o
          papel certo é a ordem de serviço, que pede peça, km de entrega e próxima revisão.
        </p>
      )}

      <Secao compacta n="1" titulo="O veículo">
        <QuadroDePares
          pares={[
            ["Placa", v?.placa ?? "—"],
            ["Modelo", v?.modelo ?? "—"],
            ["Ano", v?.ano ?? "—"],
            ["Mês de referência", quando ? nomeDoMes(quando) : "—"],
            ["Lava-jato", m.oficina ?? LINHA],
            ["Data prevista", dia(m.agendada_para)],
            ["Valor previsto", emReais(m.orcamento, LINHA)],
            ["Quem encaminhou", resp?.nome ?? "—"],
          ]}
        />
      </Secao>

      {recado && (
        <Secao compacta n="2" titulo="Recado de quem encaminhou">
          <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-slate-800">{recado}</p>
        </Secao>
      )}

      {/* O escopo com caixa para marcar: papel que volta marcado é a conferência
          de que o serviço foi feito, e é o que a expedição confronta na volta. */}
      <Secao compacta n={recado ? "3" : "2"} titulo="O que a lavagem inclui — marque o que foi feito">
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 print:grid-cols-2">
          {ITENS_LAVAGEM.map(([chave, texto]) => (
            <li key={chave} className="flex break-inside-avoid items-start gap-2">
              <Caixa className="mt-[3px]" />
              <span className="text-[11px] leading-snug text-slate-800">{texto}</span>
            </li>
          ))}
        </ul>
      </Secao>

      <Secao compacta n={recado ? "4" : "3"} titulo="Para o lava-jato preencher">
        <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-4 print:grid-cols-4">
          <ParaPreencher rotulo="Entrada (data e hora)" />
          <ParaPreencher rotulo="Saída (data e hora)" />
          <ParaPreencher rotulo="Valor cobrado (R$)" />
          <ParaPreencher rotulo="Nota fiscal nº" />
        </div>
        <div className="mt-2">
          <ParaPreencher rotulo="O que não saiu, avaria notada, observações" linhas={2} />
        </div>
      </Secao>

      {/* A conferência na volta usa os MESMOS sete itens do checklist de limpeza
          semanal. Não é repetição: é a mesma pergunta que a expedição já sabe
          responder, e é ela que diz se a lavagem pode ser paga. */}
      <Secao compacta n={recado ? "5" : "4"} titulo="Conferência da expedição na devolução">
        <table className={TABELA_DOC}>
          <thead>
            <tr>
              <th className={THC}>Item</th>
              <th className={`${THC} w-[46mm]`}>Conforme</th>
              <th className={`${THC} w-[52mm]`}>Se não, o que falta</th>
            </tr>
          </thead>
          <tbody>
            {ITENS_LIMPEZA.map(([chave, texto]) => (
              <tr key={chave} className="break-inside-avoid">
                <td className={TDC}>{texto}</td>
                <td className={`${TDC} text-[9.5px]`}>
                  <Caixas opcoes={["conforme", "não conforme"]} />
                </td>
                <td className={TDC} />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1.5 text-[9.5px] leading-relaxed text-slate-500">
          Tudo conforme: libere o pagamento e lance o valor e a nota em Manutenções. Algum item fora de conformidade:
          o lava-jato refaz antes, e a conferência também entra em Limpeza, que é de onde sai a adesão semanal.
        </p>
      </Secao>

      <div className="break-inside-avoid">
        <Secao compacta n={recado ? "6" : "5"} titulo="Assinaturas">
          <Assinaturas quem={["Responsável pelo lava-jato", "Quem entregou o veículo", "Conferido pela expedição"]} />
        </Secao>
        <RodapeDaFolha>
          Formulário {numero(m.id)} · {v?.placa ?? "—"} ·{" "}
          {quando ? `lavagem de ${nomeDoMes(quando)}` : "lavagem mensal"} · este papel não atualiza o sistema: o valor
          e a nota entram em Manutenções.
        </RodapeDaFolha>
      </div>
    </FolhaA4>
  );
}

export default function LavagemPage() {
  // useSearchParams exige Suspense na build estática do App Router.
  return (
    <Suspense fallback={<Carregando />}>
      <Formulario />
    </Suspense>
  );
}
