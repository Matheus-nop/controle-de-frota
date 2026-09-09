"use client";

import { Boxes, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Passar de um sistema do grupo para o outro sem procurar o endereço.
 *
 * A mesma caixinha existe nos três apps, com a mesma lista e na mesma ordem —
 * quem alterna o dia inteiro não pode ter que procurar em lugar diferente em
 * cada um.
 *
 * O endereço de cada sistema vem de variável (`NEXT_PUBLIC_URL_ROTEIROS`,
 * `NEXT_PUBLIC_URL_ESTOQUE`). Sem a variável o item some, em vez de levar
 * alguém para um endereço que não abre — é o que vale em desenvolvimento. Sem
 * nenhum destino, a caixinha inteira some.
 *
 * Sobre a sessão, para não prometer o que não existe: roteiros e estoque
 * dividem o mesmo `auth.users`, mas a frota ainda mora num projeto Supabase
 * próprio. Hoje trocar de sistema pede login de novo. Unificar isso é a
 * mudança da frota para o projeto compartilhado, que é outro trabalho.
 */

const AQUI = "frota";

/**
 * Só entra no menu quem tem endereço http(s) de verdade.
 *
 * Isto nasceu de um caso real: a variável foi preenchida com o texto de
 * exemplo — `https://<endereço do roteiros>` — e o app renderizou um link com
 * `<`, `>` e espaços dentro do host. O Chrome se recusa a navegar para isso e
 * mostra `about:blank#blocked`, uma mensagem que não diz uma palavra sobre
 * configuração e manda a pessoa caçar defeito no lugar errado.
 *
 * Endereço sem esquema (`estoque.exemplo.com.br`) ganha `https://`, que é o
 * engano honesto de quem copia da barra do navegador. Qualquer outra coisa
 * vira `undefined` e o item some do menu — item que sumiu faz olhar a
 * variável; link que não vai a lugar nenhum não faz olhar nada.
 */
export function enderecoDeSistema(bruto: string | undefined): string | undefined {
  const v = bruto?.trim();
  if (!v) return undefined;

  // O `https://` só entra quando NÃO há esquema. Tentar as duas formas em
  // sequência parece mais tolerante e é pior: `https://<endereço do roteiros>`
  // falha sozinho, mas com o prefixo vira `https://https//%3Cendere%C3%A7o...`,
  // que o `URL` aceita de bom grado. O valor quebrado voltaria disfarçado de
  // endereço bom — exatamente o que esta função existe para impedir.
  const candidato = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(candidato);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

const SISTEMAS = [
  {
    id: "roteiros",
    nome: "Roteiros",
    descricao: "Planejamento e rota dos técnicos",
    url: enderecoDeSistema(process.env.NEXT_PUBLIC_URL_ROTEIROS),
  },
  {
    id: "estoque",
    nome: "Estoque",
    descricao: "Equipamentos, expedição e galpões",
    url: enderecoDeSistema(process.env.NEXT_PUBLIC_URL_ESTOQUE),
  },
  {
    id: "frota",
    nome: "Frota",
    descricao: "Veículos, checklist e manutenção",
    url: undefined,
  },
];

export function TrocaSistema() {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sistemas = SISTEMAS.filter((s) => s.id === AQUI || s.url);

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

  // Só a frota na lista é uma caixinha que não leva a lugar nenhum.
  if (sistemas.length < 2) return null;

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
          {sistemas.map((s) => {
            const aqui = s.id === AQUI;
            const conteudo = (
              <>
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {s.nome}
                  {aqui && <span className="text-[10px] font-medium text-slate-400">você está aqui</span>}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{s.descricao}</span>
              </>
            );
            return aqui ? (
              <div
                key={s.id}
                className="border-b border-slate-100 bg-slate-50 px-4 py-3 last:border-b-0"
              >
                {conteudo}
              </div>
            ) : (
              <a
                key={s.id}
                href={s.url}
                role="menuitem"
                className="block border-b border-slate-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-slate-50"
              >
                {conteudo}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
