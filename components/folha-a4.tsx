"use client";

// As peças do papel corporativo em A4: a barra que não sai na impressão, o
// cabeçalho com a logomarca que se repete em toda página, a faixa do título
// com o número à direita, as seções numeradas, o quadro de identificação e as
// tabelas de cabeçalho escuro.
//
// O desenho é o mesmo das folhas do app de Estoque (`components/folha-a4.tsx`
// de lá, nascido no relatório técnico e na renovação do parque): a mesma
// pessoa imprime os dois no mesmo dia, e papel do mesmo grupo que chega com
// duas caras diferentes parece de duas empresas. O que NÃO vem de lá é a cor —
// lá a faixa é o azul `#2C3462`, aqui é o `brand-700` dos tokens deste app,
// porque é a cor do topo que o técnico vê na tela.
//
// A folha nova é peça do kit e não estilo de uma tela: são quatro papéis (a
// ordem de serviço, o formulário de lavagem, o papel do mês e o cronograma) e
// copiar a casca seria ter quatro folhas que se afastam na primeira mudança.

import type { ReactNode } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Botao, BotaoLink } from "@/components/ui";
import { EMPRESA, LINHAS_DO_CABECALHO } from "@/lib/frota/empresa";

/** Cabeçalho de tabela do documento: fundo da marca, letra branca. */
export const TH =
  "border border-brand-700 bg-brand-700 px-2.5 py-1.5 text-left text-[9px] font-semibold uppercase tracking-[0.08em] text-white";
/** Célula do documento. */
export const TD = "border border-slate-200 px-2.5 py-[5px] text-[11px] text-slate-900";
/** A tabela do documento, com linha alternada — é o que faz o olho seguir a
 *  linha certa até o fim, numa folha de nove veículos. */
export const TABELA_DOC = "w-full border-collapse [&_tbody_tr:nth-child(even)_td]:bg-slate-50";
/** A célula um pouco mais baixa, para tabela comprida. */
export const TDC = TD.replace("py-[5px]", "py-1");
export const THC = TH.replace("py-1.5", "py-1");
/** Número: à direita, sem quebrar, com dígito de largura fixa. */
export const TDN = `${TDC} whitespace-nowrap text-right tabular-nums`;
export const THN = `${THC} text-right`;

/** A caixinha para marcar à mão. Quadrado de verdade, e não "☐", que muda de
 *  desenho (ou falta) conforme a fonte que a impressora tem. */
export function Caixa({ className = "" }: { className?: string }) {
  return <span className={`inline-block size-[11px] shrink-0 border border-slate-500 align-[-1px] ${className}`} />;
}

/**
 * Uma linha de opções para marcar à mão: `☐ feita ☐ não feita`.
 *
 * Não quebra linha: numa coluna estreita as duas opções empilhariam e a tabela
 * de sete itens passaria da primeira página. A folha tem largura fixa de A4
 * (rola dentro dela no celular), então quem não couber é a coluna, e a coluna
 * é de quem chama.
 */
export function Caixas({ opcoes }: { opcoes: string[] }) {
  return (
    <span className="flex flex-nowrap items-center gap-x-2.5">
      {opcoes.map((o) => (
        <span key={o} className="inline-flex items-center gap-1 whitespace-nowrap">
          <Caixa />
          {o}
        </span>
      ))}
    </span>
  );
}

/** Uma seção do papel: o número numa caixinha da marca e o título em caixa alta. */
export function Secao({
  n,
  titulo,
  children,
  compacta,
}: {
  n: string;
  titulo: string;
  children: ReactNode;
  compacta?: boolean;
}) {
  return (
    <section className={compacta ? "mt-3" : "mt-6"}>
      <h2
        className={`flex break-after-avoid items-center gap-2.5 border-b border-slate-300 ${
          compacta ? "pb-1" : "pb-1.5"
        }`}
      >
        <span className="grid size-[22px] place-items-center rounded-[4px] bg-brand-700 text-[11px] font-bold text-white">
          {n}
        </span>
        <span className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-brand-700">{titulo}</span>
      </h2>
      <div className={compacta ? "mt-1.5" : "mt-2.5"}>{children}</div>
    </section>
  );
}

/** O quadro de identificação: rótulo pequeno em cima, valor embaixo, borda em
 *  volta. É o bloco que diz de que veículo o papel fala. */
export function QuadroDePares({ pares, colunas = 4 }: { pares: [string, ReactNode][]; colunas?: 2 | 3 | 4 }) {
  const grade = colunas === 4 ? "grid-cols-2 sm:grid-cols-4 print:grid-cols-4" : colunas === 3 ? "grid-cols-3" : "grid-cols-2";
  return (
    <div className={`grid ${grade} border-l border-t border-slate-200`}>
      {pares.map(([rotulo, valor]) => (
        <div key={rotulo} className="min-w-0 border-b border-r border-slate-200 px-2.5 py-1">
          <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">{rotulo}</p>
          <p className="break-words text-[11px] font-medium tabular-nums text-slate-900">{valor || "—"}</p>
        </div>
      ))}
    </div>
  );
}

/** O espaço para escrever à mão: o rótulo pequeno e a linha embaixo. O que só
 *  vai existir na rua não vem impresso — vem em branco, com linha. */
export function ParaPreencher({
  rotulo,
  linhas = 1,
  className = "",
}: {
  rotulo: string;
  linhas?: number;
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="text-[8.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">{rotulo}</p>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="mt-[13px] border-b border-slate-400" />
      ))}
    </div>
  );
}

/** As assinaturas do pé do papel: a linha, quem assina, e o espaço da data. */
export function Assinaturas({ quem, data = true }: { quem: string[]; data?: boolean }) {
  return (
    <div
      className={`mt-6 grid gap-6 ${
        quem.length >= 3 ? "grid-cols-1 sm:grid-cols-3 print:grid-cols-3" : "grid-cols-2"
      }`}
    >
      {quem.map((q) => (
        <div key={q} className="text-center text-[10px] text-slate-700">
          <div className="mb-1 h-10 border-b border-slate-900" />
          <b className="block text-slate-900">{q}</b>
          {data ? "nome legível · data ____/____/______" : "nome legível"}
        </div>
      ))}
    </div>
  );
}

/**
 * A faixa do título, na cor da marca: o nome do documento e, à direita, o
 * número e a data.
 */
export function FaixaDoTitulo({
  sobre,
  titulo,
  linha,
  rotuloDoNumero,
  numero,
  data,
}: {
  /** A linha pequena acima do título (o tipo, o mês). */
  sobre: ReactNode;
  titulo: string;
  /** A linha abaixo do título. */
  linha: ReactNode;
  rotuloDoNumero: string;
  numero: string;
  data: string;
}) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-md bg-brand-700">
      <div className="min-w-0 flex-1 px-5 py-2.5 text-white">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/70">{sobre}</p>
        <h1 className="mt-0.5 text-[18px] font-extrabold uppercase leading-tight tracking-[0.02em]">{titulo}</h1>
        <p className="text-[10px] text-white/80">{linha}</p>
      </div>
      <div className="flex w-[40mm] shrink-0 flex-col justify-center bg-white/10 px-4 py-2.5 text-right text-white">
        <span className="text-[8.5px] font-semibold uppercase tracking-[0.14em] text-white/70">{rotuloDoNumero}</span>
        <span className="text-[17px] font-extrabold leading-tight tabular-nums">{numero}</span>
        <span className="mt-0.5 text-[9.5px] text-white/80">{data}</span>
      </div>
    </div>
  );
}

/**
 * A folha: a barra de cima (que não sai na impressão) e o A4 com o cabeçalho
 * da casa repetido em toda página.
 *
 * O cabeçalho é um `thead` de propósito — o navegador repete o cabeçalho da
 * tabela a cada folha, e a terceira página grampeada continua dizendo de quem
 * é o papel. Foi assim que as folhas do Estoque resolveram isso.
 */
export function FolhaA4({
  voltar = "/manutencao",
  rotuloDoVoltar = "Manutenções",
  children,
}: {
  voltar?: string;
  rotuloDoVoltar?: string;
  children: ReactNode;
}) {
  return (
    <div className="pb-10">
      <div className="mx-auto flex max-w-[210mm] items-center gap-3 px-4 pt-4 print:hidden">
        <BotaoLink href={voltar}>
          <ArrowLeft size={14} />
          {rotuloDoVoltar}
        </BotaoLink>
        <Botao variante="primario" className="ml-auto" onClick={() => window.print()}>
          <Printer size={14} />
          Imprimir
        </Botao>
      </div>

      {/* Num celular a folha continua A4: rola dentro dela, e não a tela. */}
      <div className="overflow-x-auto">
        <div className="mx-auto my-4 max-w-[210mm] bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 print:my-0 print:max-w-none print:shadow-none print:ring-0">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <td className="p-0">
                  <header className="flex items-end justify-between gap-6 px-8 pb-3 pt-7 print:px-[6mm] print:pt-0">
                    <Logo altura={38} />
                    <div className="text-right text-[9px] leading-[1.45] text-slate-600">
                      <p className="text-[10px] font-bold uppercase tracking-[0.04em] text-brand-700">
                        {EMPRESA.razaoSocial}
                      </p>
                      {LINHAS_DO_CABECALHO.map((l) => (
                        <p key={l}>{l}</p>
                      ))}
                    </div>
                  </header>
                  {/* O traço da marca: o pedaço da cor e o resto cinza. */}
                  <div className="mx-8 flex h-[3px] print:mx-[6mm]">
                    <span className="w-1/4 bg-brand-700" />
                    <span className="flex-1 bg-slate-400" />
                  </div>
                  {/* O respiro: na segunda página em diante, a tabela que
                      continua não encosta no traço. */}
                  <div className="h-4" />
                </td>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-8 pb-8 print:px-[6mm] print:pb-0">{children}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/** O rodapé do papel: o que é, de quem, e quando foi impresso. */
export function RodapeDaFolha({ children }: { children: ReactNode }) {
  return <p className="mt-6 break-inside-avoid text-right text-[8.5px] text-slate-400">{children}</p>;
}
