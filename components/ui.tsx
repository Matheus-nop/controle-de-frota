"use client";

/**
 * Kit de componentes da Frota.
 *
 * É o mesmo kit do app de Roteiros (roteiros/src/components/ui.tsx), com as
 * peças que a frota tem a mais: `Placa` e os tons de situação de veículo. Quem
 * usa os dois sistemas vê o mesmo botão, o mesmo cartão e o mesmo modal — mudar
 * de app não pode custar reaprender a tela.
 *
 * Nada aqui sabe de negócio: só forma. Regra de frota fica nas páginas.
 */

import Link from "next/link";
import { X } from "lucide-react";
import {
  useEffect,
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
