"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Car,
  ChevronDown,
  ClipboardCheck,
  GitCompareArrows,
  ListChecks,
  Clock,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Plus,
  RefreshCw,
  ShieldAlert,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Marca } from "./Logo";
import { TrocaSistema } from "./TrocaSistema";
import { cx } from "./ui";
import type { Papel } from "@/lib/supabase/papel";

type ItemMenu = {
  href: string;
  rotulo: string;
  icone: typeof Car;
  papeis?: Exclude<Papel, null>[];
  /** Divisória antes do item: separa blocos de assunto. */
  sep?: boolean;
};

/**
 * Quem vê o quê. Isto é organização de tela, não controle de acesso: quem manda
 * é o proxy (`lib/supabase/middleware.ts`) e, nos dados, a RLS. A lista aqui só
 * evita mostrar um botão que leva a um redirecionamento.
 *
 * A ordem segue o dia de quem usa: primeiro onde a pessoa cai ao entrar, depois
 * o que ela abre várias vezes, e por último cadastro e relatório.
 */
const MENU: ItemMenu[] = [
  { href: "/campo", rotulo: "Início", icone: LayoutDashboard, papeis: ["TECNICO"] },
  { href: "/", rotulo: "Painel", icone: LayoutDashboard, papeis: ["GESTOR", "PCM"] },
  { href: "/roteiro/saida", rotulo: "Saída", icone: LogOut, papeis: ["TECNICO"] },
  { href: "/roteiro/chegada", rotulo: "Chegada", icone: LogIn, papeis: ["TECNICO"] },
  { href: "/alertas", rotulo: "Alertas", icone: AlertTriangle, papeis: ["GESTOR", "PCM"], sep: true },
  { href: "/manutencao", rotulo: "Manutenção", icone: Wrench, papeis: ["GESTOR", "PCM"] },
  { href: "/escopos", rotulo: "Escopo", icone: ListChecks, papeis: ["GESTOR", "PCM"] },
  { href: "/ocorrencias", rotulo: "Ocorrências", icone: ShieldAlert, papeis: ["GESTOR"] },
  { href: "/checklist", rotulo: "Checklist", icone: ClipboardCheck, papeis: ["TECNICO", "PCM"] },
  { href: "/historico", rotulo: "Histórico", icone: History, papeis: ["GESTOR", "PCM"] },
  { href: "/comparativo", rotulo: "Comparar", icone: GitCompareArrows, papeis: ["GESTOR", "PCM"] },
  { href: "/ponto", rotulo: "Ponto", icone: Clock, papeis: ["GESTOR", "PONTO"] },
  { href: "/veiculos", rotulo: "Veículos", icone: Car, papeis: ["GESTOR"], sep: true },
  { href: "/usuarios", rotulo: "Usuários", icone: Users, papeis: ["GESTOR"] },
  { href: "/relatorios", rotulo: "Relatórios", icone: BarChart3, papeis: ["GESTOR"] },
];

const PAPEL_LABEL: Record<Exclude<Papel, null>, string> = {
  GESTOR: "Gestor",
  PCM: "PCM",
  PONTO: "Ponto",
  TECNICO: "Técnico",
};

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

export function Casca({
  papel,
  nome,
  children,
}: {
  papel: Papel;
  nome: string | null;
  children: React.ReactNode;
}) {
  const [menu, setMenu] = useState(false);
  const [gaveta, setGaveta] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const itens = MENU.filter((m) => !m.papeis || !papel || m.papeis.includes(papel));
  // O ponto não lança roteiro: para ele o botão de saída seria um beco.
  const lanca = papel !== "PONTO";

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function atualizar() {
    setAtualizando(true);
    router.refresh();
    // O refresh não avisa quando termina; meio segundo é o bastante para o giro
    // ser lido como resposta ao toque, sem travar o botão.
    setTimeout(() => setAtualizando(false), 600);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f7fa]">
      {/* Barra superior: identidade à esquerda, estado e ações à direita.
          `height` + `pt-segura`: a faixa colorida cobre o recorte do sistema,
          mas os botões ficam abaixo dele. Sem isso, no iPhone instalado o menu
          e o logotipo caem debaixo da barra de status e não recebem toque. */}
      <header
        style={{ height: "calc(var(--topo-h) + var(--safe-top))" }}
        className="pt-segura sticky top-0 z-40 flex items-center gap-2 bg-gradient-to-r from-brand-800 via-brand-700 to-brand-600 px-3 text-white shadow-sm print:hidden sm:gap-3 sm:px-4"
      >
        <button
          onClick={() => setGaveta(true)}
          className="-ml-1 rounded-lg p-2 hover:bg-white/10 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu size={18} />
        </button>
        <Link
          href={papel === "PONTO" ? "/ponto" : papel === "TECNICO" ? "/campo" : "/"}
          className="flex min-w-0 items-center rounded-lg py-1 pr-1 transition hover:opacity-90"
          aria-label="Ir para o início"
        >
          <Marca />
        </Link>

        <div className="flex-1" />

        <button
          onClick={atualizar}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[12px] font-semibold text-white ring-1 ring-white/15 transition hover:bg-white/20"
          title="Buscar os dados mais recentes"
        >
          <RefreshCw size={13} className={atualizando ? "animate-spin" : ""} />
          <span className="hidden xl:inline">Atualizar</span>
        </button>

        {lanca && (
          <Link
            href="/roteiro/saida"
            className="flex shrink-0 items-center gap-1 rounded-lg bg-acento-500 px-2.5 py-1.5 text-[12px] font-bold text-brand-900 shadow-sm transition hover:bg-acento-400 lg:px-3"
            title="Registrar a saída de um veículo"
          >
            <Plus size={14} />
            <span className="hidden whitespace-nowrap lg:inline">Registrar saída</span>
          </Link>
        )}

        <TrocaSistema />

        <div className="relative shrink-0" ref={ref}>
          <button
            onClick={() => setMenu((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={menu}
            className="flex items-center gap-1.5 rounded-lg p-1 transition hover:bg-white/10"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-[12px] font-bold uppercase ring-1 ring-white/20">
              {(nome ?? "?").slice(0, 1)}
            </span>
            <ChevronDown size={13} className="opacity-70" />
          </button>
          {menu && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-60 overflow-hidden rounded-xl bg-white text-slate-800 shadow-xl ring-1 ring-slate-200"
            >
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="truncate text-sm font-semibold">{nome ?? "Sem cadastro"}</div>
                <div className="mt-2 inline-flex rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-bold text-brand-700 ring-1 ring-brand-100">
                  {papel ? PAPEL_LABEL[papel] : "—"}
                </div>
              </div>
              <div className="p-1">
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-slate-100"
                  >
                    <LogOut size={14} />
                    Sair
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Navegação: abas em telas grandes, gaveta no celular. */}
      <nav
        style={{ top: "calc(var(--topo-h) + var(--safe-top))" }}
        className="sticky z-30 hidden border-b border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)] print:hidden lg:block"
      >
        <div className="rolagem-fina mx-auto flex max-w-[1800px] items-center overflow-x-auto px-2">
          {itens.map((m) => {
            const on = ativo(pathname, m.href);
            return (
              <div key={m.href} className="flex items-center">
                {m.sep && <span className="mx-1.5 h-5 w-px bg-slate-200" />}
                <Link
                  href={m.href}
                  aria-current={on ? "page" : undefined}
                  className={cx(
                    "relative flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-[13px] font-medium transition",
                    on ? "text-brand-700" : "text-slate-500 hover:text-slate-900",
                  )}
                >
                  <m.icone size={15} className={on ? "text-brand-600" : "opacity-70"} />
                  {m.rotulo}
                  <span
                    className={cx(
                      "absolute inset-x-2 bottom-0 h-[2.5px] rounded-t-full transition",
                      on ? "bg-acento-500" : "bg-transparent",
                    )}
                  />
                </Link>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Gaveta de navegação (celular e tablet) */}
      {gaveta && (
        <div
          className="fixed inset-0 z-50 lg:hidden print:hidden"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setGaveta(false);
          }}
        >
          <div className="absolute inset-0 bg-slate-900/50" />
          <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col bg-white shadow-2xl">
            <div
              style={{ height: "calc(var(--topo-h) + var(--safe-top))" }}
              className="pt-segura flex items-center justify-between bg-gradient-to-r from-brand-800 to-brand-600 px-3 text-white"
            >
              <Marca />
              <button onClick={() => setGaveta(false)} className="rounded-lg p-2 hover:bg-white/10" aria-label="Fechar menu">
                <X size={18} />
              </button>
            </div>
            <div className="rolagem-fina flex-1 overflow-y-auto p-2">
              {itens.map((m) => {
                const on = ativo(pathname, m.href);
                return (
                  <div key={m.href}>
                    {m.sep && <div className="my-1.5 border-t border-slate-100" />}
                    <Link
                      href={m.href}
                      onClick={() => setGaveta(false)}
                      className={cx(
                        "toque flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition",
                        on ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      <m.icone size={17} className="opacity-80" />
                      {m.rotulo}
                    </Link>
                  </div>
                );
              })}
            </div>
            <div className="pb-segura border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
              {nome ?? "sem cadastro"} · {papel ? PAPEL_LABEL[papel] : "—"}
            </div>
          </div>
        </div>
      )}

      {papel === "TECNICO" && !nome && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 print:hidden">
          <b>Seu login ainda não está vinculado a uma pessoa.</b> Nada pode ser lançado até um
          gestor cadastrar você em <code>Usuários</code> — todo roteiro, checklist e manutenção é
          gravado no nome de alguém do cadastro.
        </div>
      )}

      <main className="flex-1">{children}</main>
    </div>
  );
}
