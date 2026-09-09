"use client";

import { Boxes, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Passar para os outros sistemas do grupo sem procurar o endereço.
 *
 * Espelha a caixinha "Sistemas" do Roteiros e do Estoque: os três topos ficam
 * iguais, e quem alterna o dia inteiro não precisa procurar em lugar diferente
 * em cada app.
 *
 * Os endereços vêm de `NEXT_PUBLIC_URL_ROTEIROS` e `NEXT_PUBLIC_URL_ESTOQUE`.
 * Sem variável o item some, em vez de levar alguém para um endereço que não
 * abre. Sem nenhuma das duas, a caixinha inteira some.
 *
 * O login é o mesmo nos três (o `auth.users` é um só), mas a sessão ainda não:
 * hoje se entra uma vez de cada lado.
 */
const DESTINOS = [
  {
    url: process.env.NEXT_PUBLIC_URL_ROTEIROS,
    nome: "Roteiros",
    descricao: "Planejamento e rota dos técnicos",
  },
  {
    url: process.env.NEXT_PUBLIC_URL_ESTOQUE,
    nome: "Estoque",
    descricao: "Equipamentos, expedição e galpões",
  },
];

export function TrocaSistema() {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const destinos = DESTINOS.filter((d) => d.url);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  if (destinos.length === 0) return null;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/20"
      >
        <span className="hidden sm:inline">Sistemas</span>
        <Boxes size={15} className="sm:hidden" />
        <ChevronDown size={13} className="opacity-70" />
      </button>

      {aberto && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-64 overflow-hidden rounded-xl bg-white text-slate-800 shadow-xl ring-1 ring-slate-200"
        >
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              Frota <span className="text-[10px] font-medium text-slate-400">você está aqui</span>
            </div>
            <div className="mt-0.5 text-xs text-slate-500">Veículos, roteiros e manutenção</div>
          </div>
          {destinos.map((d) => (
            <a
              key={d.nome}
              href={d.url}
              role="menuitem"
              className="block px-4 py-3 transition-colors hover:bg-slate-50"
            >
              <div className="text-sm font-semibold">{d.nome}</div>
              <div className="mt-0.5 text-xs text-slate-500">{d.descricao}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
