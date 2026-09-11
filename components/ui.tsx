"use client";

/**
 * Kit de componentes da Frota.
 *
 * É o mesmo kit do app de Roteiros (roteiros/src/components/ui.tsx), com as
 * peças que a frota tem a mais: `Placa`, `CampoNumero` e os tons de situação de
 * veículo. Quem usa os dois sistemas vê o mesmo botão, o mesmo cartão e o mesmo
 * modal — mudar de app não pode custar reaprender a tela.
 *
 * Nada aqui sabe de negócio: só forma. Regra de frota fica nas páginas. As três
 * peças acima são a exceção assumida — km, placa e situação aparecem em tela
 * demais para cada uma remontar a sua.
 */

import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import { emKm, emKmPorLitro, emReais, paraDecimal, paraInteiro } from "@/lib/frota/numero";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variante = "primario" | "secundario" | "perigo" | "fantasma" | "sucesso" | "acento";

const VAR: Record<Variante, string> = {
  primario: "bg-[#1a56db] text-white hover:bg-[#1748c9] ring-[#1a56db]",
  secundario: "bg-white text-slate-700 hover:bg-slate-50 ring-slate-300",
  perigo: "bg-white text-red-700 hover:bg-red-50 ring-red-200",
  fantasma: "bg-transparent text-slate-600 hover:bg-slate-100 ring-transparent",
  sucesso: "bg-emerald-600 text-white hover:bg-emerald-700 ring-emerald-600",
  acento: "bg-acento-500 text-brand-900 hover:bg-acento-400 ring-acento-500 font-bold",
};

export function Botao({
  variante = "secundario",
  tamanho = "md",
  className,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamanho?: "sm" | "md" | "lg" }) {
  return (
    <button
      {...p}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium ring-1 ring-inset shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50",
        tamanho === "sm" ? "px-2 py-1 text-xs" : tamanho === "lg" ? "toque px-4 py-2.5 text-[15px]" : "px-3 py-1.5 text-sm",
        VAR[variante],
        className,
      )}
    />
  );
}

/**
 * Mesmo desenho do Botao, mas navega — `<a>` e `<button>` não podem ser
 * trocados um pelo outro. Endereço interno vira `next/link` (troca de tela sem
 * recarregar o app); endereço de fora continua `<a>`.
 */
export function BotaoLink({
  variante = "secundario",
  tamanho = "md",
  className,
  href = "#",
  ...p
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { variante?: Variante; tamanho?: "sm" | "md" | "lg" }) {
  const classe = cx(
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium ring-1 ring-inset shadow-sm transition",
    tamanho === "sm" ? "px-2 py-1 text-xs" : tamanho === "lg" ? "toque px-4 py-2.5 text-[15px]" : "px-3 py-1.5 text-sm",
    VAR[variante],
    className,
  );
  if (href.startsWith("/")) return <Link href={href} {...p} className={classe} />;
  return <a href={href} {...p} className={classe} />;
}

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx("campo", p.className)} />;
}
export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={cx("campo", p.className)} />;
}
export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={cx("campo", p.className)} />;
}
export function Campo({
  rotulo,
  children,
  className,
  dica,
}: {
  rotulo: string;
  children: ReactNode;
  className?: string;
  dica?: ReactNode;
}) {
  return (
    <label className={cx("block", className)}>
      <span className="rotulo">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-[11.5px] text-slate-500">{dica}</span>}
    </label>
  );
}

/**
 * Campo de número que fala português.
 *
 * Existe porque `<input type="number">` mentiu numa apresentação: o gestor
 * digitou `30.000` de km e `3.000,00` de orçamento — a grafia certa em pt-BR —
 * e o sistema gravou 30 e 3, mil vezes menos, sem uma palavra. O `type=number`
 * ainda tem dois vícios próprios: o valor muda sozinho quando a roda do mouse
 * passa por cima, e o que ele considera inválido some do campo sem aviso.
 *
 * Aqui o campo é texto — o que foi digitado fica onde foi digitado — e a
 * conversão é a de `lib/frota/numero`, que entende ponto de milhar e vírgula
 * decimal. O `inputMode` é o que faz o teclado do celular abrir nos números,
 * que era a única coisa boa que o `type=number` dava.
 *
 * E embaixo do campo aparece o número que vai ser gravado, formatado. É a
 * peça central: `30.000` só é ambíguo até alguém ler "30.000 km" logo abaixo.
 * Erro de mil vezes não pode depender de conferir a ordem de serviço impressa.
 */
export function CampoNumero({
  rotulo,
  valor,
  onValor,
  unidade,
  dica,
  className,
  ...p
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  rotulo: string;
  valor: string;
  onValor: (v: string) => void;
  /** Decide o arredondamento e o texto do eco. `km` não tem casa decimal. */
  unidade: "km" | "reais" | "km/l";
  dica?: ReactNode;
  className?: string;
}) {
  const n = unidade === "km" ? paraInteiro(valor) : paraDecimal(valor);
  const digitou = valor.trim() !== "";

  // Campo vazio não ecoa nada; texto que não vira número avisa, em vez de
  // virar nulo caladamente.
  const eco = !digitou ? null : n == null ? (
    <span className="font-semibold text-red-700">não parece um número</span>
  ) : (
    <span className="font-semibold text-slate-700">
      {unidade === "km" ? emKm(n) : unidade === "reais" ? emReais(n) : emKmPorLitro(n)}
    </span>
  );

  // O eco não come a dica da tela: na chegada, "Km na saída: 66.402" é
  // justamente o que a pessoa está conferindo enquanto digita.
  const rodape =
    eco && dica ? (
      <>
        {eco} · {dica}
      </>
    ) : (
      (eco ?? dica)
    );

  return (
    <Campo rotulo={rotulo} className={className} dica={rodape}>
      <Input
        {...p}
        type="text"
        inputMode={unidade === "km" ? "numeric" : "decimal"}
        value={valor}
        onChange={(e) => onValor(e.target.value)}
      />
    </Campo>
  );
}

/**
 * Campo de fotos que ACUMULA escolhas.
 *
 * Existe por um defeito relatado do campo: o técnico da Saveiro clicava em
 * "escolher arquivo" cinco vezes, uma foto por vez, e o checklist subia UMA.
 *
 * A causa é do `<input type="file">`, não da pessoa: cada escolha SUBSTITUI a
 * seleção inteira. As telas guardavam o `e.target.files` direto, então a quinta
 * foto apagava as quatro anteriores. Escolher as cinco de uma vez funcionava —
 * e é justamente o que ninguém adivinha sozinho, ainda mais no celular, em pé
 * ao lado do veículo, onde a galeria abre uma foto por vez.
 *
 * Aqui a lista é do componente, não do input: cada escolha soma. O input é
 * zerado depois de cada uma, senão escolher a MESMA foto de novo não dispara
 * evento nenhum — e o técnico ficaria clicando sem entender por que nada
 * acontece.
 *
 * As miniaturas não são enfeite: sem elas não dá para saber o que está
 * anexado, que é o que fez o defeito passar tanto tempo despercebido.
 */
export function CampoFotos({
  rotulo,
  dica,
  arquivos,
  onArquivos,
  className,
  accept = "image/*",
}: {
  rotulo: string;
  dica?: ReactNode;
  arquivos: File[];
  onArquivos: (f: File[]) => void;
  className?: string;
  accept?: string;
}) {
  // Miniatura de cada arquivo. O endereço é revogado quando a lista muda, senão
  // cada troca de foto deixa um blob preso na memória do celular.
  const previas = useMemo(
    () => arquivos.map((f) => ({ nome: f.name, url: URL.createObjectURL(f) })),
    [arquivos],
  );
  useEffect(() => {
    return () => previas.forEach((p) => URL.revokeObjectURL(p.url));
  }, [previas]);

  // Mesma foto escolhida duas vezes não entra duas vezes. Nome sozinho não
  // basta: a câmera do celular repete nome o tempo todo.
  const chave = (f: File) => `${f.name}|${f.size}|${f.lastModified}`;

  function somar(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    const tinha = new Set(arquivos.map(chave));
    const novos = Array.from(lista).filter((f) => !tinha.has(chave(f)));
    if (novos.length) onArquivos([...arquivos, ...novos]);
  }

  return (
    <Campo
      rotulo={rotulo}
      className={className}
      dica={
        arquivos.length === 0 ? (
          dica
        ) : (
          <span className="font-semibold text-slate-700">
            {arquivos.length} foto(s) anexada(s)
            {dica ? <span className="font-normal text-slate-500"> · {dica}</span> : null}
          </span>
        )
      }
    >
      <input
        type="file"
        accept={accept}
        multiple
        onChange={(e) => {
          somar(e.target.files);
          // Zera para a próxima escolha disparar evento mesmo se for o mesmo
          // arquivo, e para o "N arquivos" nativo não contradizer a lista.
          e.target.value = "";
        }}
        className="campo file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-700"
      />

      {previas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {previas.map((p, i) => (
            <div key={p.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.nome}
                className="block h-[72px] w-[72px] rounded-lg object-cover ring-1 ring-slate-200"
              />
              <button
                type="button"
                aria-label={`Remover ${p.nome}`}
                onClick={() => onArquivos(arquivos.filter((_, k) => k !== i))}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-800 p-1 text-white shadow ring-2 ring-white hover:bg-red-600"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Campo>
  );
}

/**
 * Uma vaga de foto, com nome e lugar certo.
 *
 * É a peça do checklist guiado: em vez de "anexe as fotos do veículo", o
 * técnico vê FRONTAL, LATERAL ESQUERDA, LATERAL DIREITA, TRASEIRA e PAINEL, uma
 * de cada vez. Duas coisas melhoram de uma vez:
 *
 * - some o defeito das cinco escolhas (cada vaga guarda UMA foto, então não há
 *   seleção para substituir);
 * - a foto passa a ter ângulo conhecido, e a traseira de hoje pode ser
 *   comparada com a traseira da semana passada, e não com a lateral.
 *
 * Vaga preenchida mostra a miniatura e troca o texto do botão: em pé ao lado do
 * veículo, saber o que já foi tirado é metade do trabalho.
 */
export function CampoFoto({
  rotulo,
  arquivo,
  onArquivo,
  dica,
  obrigatoria,
  daCamera = true,
}: {
  rotulo: string;
  arquivo: File | null;
  onArquivo: (f: File | null) => void;
  dica?: ReactNode;
  obrigatoria?: boolean;
  /**
   * Abrir a câmera direto, no celular, em vez do seletor de arquivo.
   *
   * Ligado por padrão porque é o que a vistoria do técnico pede: ele está em pé
   * ao lado do veículo, e a foto é o que ele está vendo AGORA. Deixar a galeria
   * à mão ali é convidar a reaproveitar a foto da semana passada, e uma vistoria
   * com foto velha não prova nada — que é a única coisa que ela serve para
   * fazer.
   *
   * Desligado nas telas de correção do gestor, onde é exatamente o contrário: a
   * foto chegou por fora (WhatsApp, e-mail) e precisa vir do arquivo. No
   * computador o navegador ignora isto e sempre abre o seletor.
   */
  daCamera?: boolean;
}) {
  const previa = useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : null), [arquivo]);
  useEffect(() => {
    return () => {
      if (previa) URL.revokeObjectURL(previa);
    };
  }, [previa]);

  return (
    <div
      className={cx(
        "rounded-lg p-3 ring-1 ring-inset transition",
        arquivo ? "bg-emerald-50/50 ring-emerald-300" : "bg-white ring-slate-300",
      )}
    >
      <div className="flex items-start gap-3">
        {previa ? (
          <div className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previa}
              alt={rotulo}
              className="block h-[64px] w-[64px] rounded-lg object-cover ring-1 ring-emerald-300"
            />
            <button
              type="button"
              aria-label={`Remover foto ${rotulo}`}
              onClick={() => onArquivo(null)}
              className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-800 p-1 text-white shadow ring-2 ring-white hover:bg-red-600"
            >
              <X size={11} />
            </button>
          </div>
        ) : (
          <div className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[11px] font-bold text-slate-400 ring-1 ring-inset ring-slate-200">
            sem foto
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13.5px] font-bold text-slate-800">{rotulo}</span>
            {obrigatoria && !arquivo && (
              <span className="text-[11px] font-semibold text-red-600">obrigatória</span>
            )}
          </div>
          {dica && <div className="mt-0.5 text-[11.5px] text-slate-500">{dica}</div>}
          <input
            type="file"
            accept="image/*"
            capture={daCamera ? "environment" : undefined}
            onChange={(e) => {
              onArquivo(e.target.files?.[0] ?? null);
              // Zera para dar para escolher a MESMA foto de novo depois de
              // remover — sem isso o input não dispara evento e parece travado.
              e.target.value = "";
            }}
            className="campo mt-1.5 file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-700"
          />
        </div>
      </div>
    </div>
  );
}

export function Checkbox(p: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="checkbox"
      {...p}
      className={cx("h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600/30", p.className)}
    />
  );
}

/* ------------------------------------------------------------------ etiquetas */

/** Tons de situação. `mudo` é o neutro; os outros carregam significado. */
export const TOM = {
  mudo: "bg-slate-100 text-slate-700 ring-slate-200",
  ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  atencao: "bg-amber-50 text-amber-800 ring-amber-200",
  critico: "bg-red-50 text-red-800 ring-red-200",
  info: "bg-brand-50 text-brand-800 ring-brand-200",
} as const;
export type Tom = keyof typeof TOM;

export function Badge({
  children,
  tom = "mudo",
  className,
}: {
  children: ReactNode;
  tom?: Tom;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        TOM[tom],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A placa é o identificador do veículo: destacada e monoespaçada, nunca solta no texto. */
export function Placa({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("placa", className)}>{children}</span>;
}

/* ------------------------------------------------------------------ estrutura */

export function Cartao({
  children,
  className,
  titulo,
  acoes,
}: {
  children: ReactNode;
  className?: string;
  titulo?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <section className={cx("rounded-xl bg-white shadow-sm ring-1 ring-slate-200", className)}>
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
          <div className="text-sm font-semibold text-slate-800">{titulo}</div>
          <div className="flex flex-wrap items-center gap-2">{acoes}</div>
        </header>
      )}
      {children}
    </section>
  );
}

export function Pagina({
  titulo,
  subtitulo,
  acoes,
  children,
  estreita,
}: {
  titulo: string;
  subtitulo?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  /** Telas de formulário e de campo leem melhor numa coluna só. */
  estreita?: boolean;
}) {
  return (
    <div className={cx("mx-auto px-4 py-4 sm:px-5", estreita ? "max-w-3xl" : "max-w-[1800px]")}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">{titulo}</h1>
          {subtitulo && <p className="mt-0.5 text-[13px] text-slate-500">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {children}
    </div>
  );
}

export function Contador({
  rotulo,
  valor,
  legenda,
  tom = "text-slate-900",
  onClick,
  href,
}: {
  rotulo: string;
  valor: number | string;
  legenda?: ReactNode;
  tom?: string;
  onClick?(): void;
  href?: string;
}) {
  const conteudo = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{rotulo}</div>
      <div className={cx("mt-1 text-[26px] font-bold leading-none tabular-nums", tom)}>{valor}</div>
      {legenda && <div className="mt-1.5 truncate text-[11.5px] text-slate-500">{legenda}</div>}
    </>
  );
  const classe = cx(
    "block rounded-xl bg-white px-4 py-3.5 text-left shadow-sm ring-1 ring-slate-200 transition",
    (onClick || href) && "hover:ring-brand-300",
  );
  // Sem destino nem ação é só um número na tela: `div`, não um botão que não faz
  // nada — o leitor de tela anunciaria um controle inexistente.
  if (href) return <Link href={href} className={classe}>{conteudo}</Link>;
  if (onClick)
    return (
      <button onClick={onClick} className={classe} type="button">
        {conteudo}
      </button>
    );
  return <div className={classe}>{conteudo}</div>;
}

export function Vazio({ titulo, texto, children }: { titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-700">{titulo}</p>
      {texto && <p className="mt-1 max-w-md text-sm text-slate-500">{texto}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{texto}</div>;
}

/** Recado de erro ou aviso no corpo da página. */
export function Aviso({ tom = "critico", children }: { tom?: Tom; children: ReactNode }) {
  return (
    <div className={cx("rounded-lg px-3 py-2 text-sm ring-1 ring-inset", TOM[tom])}>{children}</div>
  );
}

/* ------------------------------------------------------------------ modais */

export function Modal({
  titulo,
  aberto,
  onFechar,
  children,
  rodape,
  largura = "max-w-lg",
}: {
  titulo: ReactNode;
  aberto: boolean;
  onFechar(): void;
  children: ReactNode;
  rodape?: ReactNode;
  largura?: string;
}) {
  useEffect(() => {
    if (!aberto) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[6vh] print:hidden"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className={cx("w-full rounded-xl bg-white shadow-xl ring-1 ring-slate-200", largura)}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-800">{titulo}</h2>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="-mr-1 shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {rodape && (
          <div className="flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-3">
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}

export function Confirmar({
  aberto,
  titulo,
  texto,
  onConfirmar,
  onFechar,
  perigo,
  confirmarTexto = "Confirmar",
}: {
  aberto: boolean;
  titulo: string;
  texto: ReactNode;
  onConfirmar(): void;
  onFechar(): void;
  perigo?: boolean;
  confirmarTexto?: string;
}) {
  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      onFechar={onFechar}
      rodape={
        <>
          <Botao onClick={onFechar}>Cancelar</Botao>
          <Botao variante={perigo ? "perigo" : "primario"} onClick={onConfirmar}>
            {confirmarTexto}
          </Botao>
        </>
      }
    >
      <div className="text-sm text-slate-700">{texto}</div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ fotos */

/** Uma foto para a tira e para a galeria. */
export type FotoGaleria = {
  url: string;
  /** O que a foto é: "traseira", "avaria", "chegada". Aparece embaixo da
   *  miniatura e dentro da galeria. */
  legenda?: string;
  /** Chama atenção na legenda. Hoje marca foto que o gestor anexou depois. */
  destaque?: boolean;
};

/**
 * A foto em tela cheia, com seta para passar para a próxima.
 *
 * Onze fotos numa vistoria é o normal, e abrir uma por uma em aba nova para
 * comparar a traseira de hoje com a de semana passada é o tipo de coisa que faz
 * alguém desistir de conferir. Aqui a pessoa abre uma e vai apertando a seta.
 *
 * Passa dos dois lados (a última volta para a primeira) de propósito: quem está
 * apertando a seta para ver o veículo inteiro não quer descobrir o fim da lista
 * por uma tecla que parou de responder.
 *
 * Teclado, botão e deslize no celular fazem a mesma coisa — é a mesma pessoa
 * olhando do computador na reunião e do celular no pátio.
 */
export function Galeria({
  fotos,
  indice,
  onIndice,
  onFechar,
}: {
  fotos: FotoGaleria[];
  indice: number;
  onIndice: (i: number) => void;
  onFechar: () => void;
}) {
  const total = fotos.length;
  const inicioDoToque = useRef({ x: 0, y: 0 });
  const andar = useCallback(
    (passo: number) => {
      if (total === 0) return;
      onIndice((indice + passo + total) % total);
    },
    [indice, total, onIndice],
  );

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "ArrowRight") andar(1);
      else if (e.key === "ArrowLeft") andar(-1);
      else if (e.key === "Escape") onFechar();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", tecla);
    // Trava a rolagem do fundo: no celular, arrastar na foto rolava a página
    // atrás em vez de passar a foto.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
    };
  }, [andar, onFechar]);

  const foto = fotos[indice];
  if (!foto) return null;

  // Deslize: só conta movimento horizontal de verdade, senão rolar a tela com o
  // dedo no meio da foto passaria de foto sem querer. Em `ref` porque variável
  // solta escrita depois do render é o que o lint do projeto (com razão) barra.
  const toque = inicioDoToque;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onFechar}
      onTouchStart={(e) => {
        toque.current = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - toque.current.x;
        const dy = e.changedTouches[0].clientY - toque.current.y;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) andar(dx < 0 ? 1 : -1);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Foto da vistoria"
    >
      <div className="flex items-center gap-3 px-4 pt-4 text-white">
        <span className="text-[13px] font-semibold tabular-nums">
          {indice + 1} de {total}
        </span>
        {foto.legenda && (
          <span className="truncate text-[13px] text-white/70">{foto.legenda}</span>
        )}
        <a
          href={foto.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="toque ml-auto rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Abrir a foto original em outra aba"
        >
          <ExternalLink size={18} />
        </a>
        <button
          type="button"
          onClick={onFechar}
          className="toque rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
          aria-label="Fechar"
        >
          <X size={20} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center gap-1 px-1 py-2 sm:gap-3 sm:px-3">
        {total > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              andar(-1);
            }}
            className="toque shrink-0 rounded-full bg-white/10 p-2 text-white hover:bg-white/25 sm:p-3"
            aria-label="Foto anterior"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={foto.url}
          alt={foto.legenda ?? "foto"}
          onClick={(e) => e.stopPropagation()}
          className="mx-auto max-h-full min-h-0 w-auto max-w-full rounded-lg object-contain"
        />
        {total > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              andar(1);
            }}
            className="toque shrink-0 rounded-full bg-white/10 p-2 text-white hover:bg-white/25 sm:p-3"
            aria-label="Próxima foto"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {total > 1 && (
        <div
          className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-4 pt-1"
          onClick={(e) => e.stopPropagation()}
        >
          {fotos.map((f, i) => (
            <button
              key={f.url + i}
              type="button"
              onClick={() => onIndice(i)}
              className={cx(
                "shrink-0 rounded ring-2 transition",
                i === indice ? "ring-white" : "ring-transparent opacity-50 hover:opacity-90",
              )}
              aria-label={`Ir para a foto ${i + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="" className="block h-12 w-12 rounded object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A tira de miniaturas de um registro. Clicar abre a galeria, já na foto certa.
 *
 * Mora no kit porque histórico, comparativo e vistoria mostram exatamente a
 * mesma coisa — e porque a galeria só funciona se quem a abre souber a lista
 * INTEIRA, e não a foto isolada que a pessoa clicou.
 */
export function TiraDeFotos({
  fotos,
  tamanho = "md",
  className,
}: {
  fotos: FotoGaleria[];
  tamanho?: "sm" | "md";
  className?: string;
}) {
  const [aberta, setAberta] = useState<number | null>(null);
  if (fotos.length === 0) return null;
  const lado = tamanho === "sm" ? "h-20 w-20" : "h-[84px] w-[84px]";

  return (
    <>
      <div className={cx("flex flex-wrap gap-2", className)}>
        {fotos.map((f, i) => (
          <button key={f.url + i} type="button" onClick={() => setAberta(i)} className="block text-left">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.url}
              alt={f.legenda ? `Foto ${f.legenda}` : "foto"}
              loading="lazy"
              className={cx(
                lado,
                "block rounded-lg object-cover ring-1 ring-slate-200 transition hover:ring-brand-400",
              )}
            />
            {f.legenda && (
              <span
                className={cx(
                  "mt-1 block text-center text-[10.5px]",
                  f.destaque ? "text-amber-700" : "text-slate-400",
                )}
              >
                {f.legenda}
              </span>
            )}
          </button>
        ))}
      </div>
      {aberta !== null && (
        <Galeria
          fotos={fotos}
          indice={aberta}
          onIndice={setAberta}
          onFechar={() => setAberta(null)}
        />
      )}
    </>
  );
}
