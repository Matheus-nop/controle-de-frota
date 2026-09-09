"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  ClipboardCheck,
  LogIn,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { horaDe } from "@/lib/frota/tempo";
import { Cartao, Pagina, Placa, cx } from "@/components/ui";

type Aberto = {
  id: string;
  saida_em: string;
  km_saida: number;
  veiculo: { placa: string; modelo: string } | { placa: string; modelo: string }[] | null;
  tecnico: { nome: string } | { nome: string }[] | null;
};

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

/**
 * As quatro coisas que o técnico faz no celular, em ordem de frequência. Alvo
 * de toque grande e uma cor por ação: no galpão a pessoa acerta pela cor antes
 * de ler o rótulo.
 */
const ACOES: { href: string; icone: LucideIcon; titulo: string; sub: string; cor: string; fundo: string }[] = [
  {
    href: "/roteiro/saida",
    icone: LogOut,
    titulo: "Registrar saída",
    sub: "Vou pegar um veículo",
    cor: "text-brand-700",
    fundo: "bg-brand-50 ring-brand-100",
  },
  {
    href: "/roteiro/chegada",
    icone: LogIn,
    titulo: "Registrar chegada",
    sub: "Voltei / fechar roteiro",
    cor: "text-emerald-700",
    fundo: "bg-emerald-50 ring-emerald-100",
  },
  {
    href: "/checklist",
    icone: ClipboardCheck,
    titulo: "Checklist do veículo",
    sub: "Vistoria semanal",
    cor: "text-slate-700",
    fundo: "bg-slate-100 ring-slate-200",
  },
  {
    href: "/ocorrencia",
    icone: AlertTriangle,
    titulo: "Relatar ocorrência",
    sub: "Dano, acidente ou avaria",
    cor: "text-red-700",
    fundo: "bg-red-50 ring-red-100",
  },
];

export default function CampoPage() {
  const [abertos, setAbertos] = useState<Aberto[]>([]);
  const [nome, setNome] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const [rot, eu] = await Promise.all([
        supabase
          .from("roteiros")
          .select("id, saida_em, km_saida, veiculo:veiculo_id(placa,modelo), tecnico:tecnico_saida_id(nome)")
          .is("chegada_em", null)
          .order("saida_em"),
        user
          ? supabase.from("tecnicos").select("nome").eq("user_id", user.id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      setAbertos((rot.data as Aberto[]) ?? []);
      setNome((eu.data as { nome?: string } | null)?.nome ?? null);
    })();
  }, []);

  return (
    <Pagina
      estreita
      titulo={nome ? `Olá, ${nome.split(" ")[0]}` : "Bom trabalho"}
      subtitulo="O que você vai fazer agora?"
    >
      <div className="flex flex-col gap-2.5">
        {ACOES.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="toque flex items-center gap-3.5 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 transition hover:ring-brand-300"
          >
            <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1", a.fundo, a.cor)}>
              <a.icone size={21} />
            </span>
            <span className="min-w-0">
              <span className="block text-[16px] font-semibold text-slate-900">{a.titulo}</span>
              <span className="block text-[13px] text-slate-500">{a.sub}</span>
            </span>
            <ChevronRight size={18} className="ml-auto shrink-0 text-slate-300" />
          </Link>
        ))}
      </div>

      <Cartao
        className="mt-5"
        titulo="Na rua agora"
        acoes={
          <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-white">
            {abertos.length}
          </span>
        }
      >
        {abertos.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-slate-500">
            Nenhum veículo na rua no momento.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {abertos.map((r) => {
              const v = one(r.veiculo);
              const t = one(r.tecnico);
              return (
                <li key={r.id}>
                  <Link
                    href="/roteiro/chegada"
                    className="toque flex items-center gap-2.5 px-4 py-3 transition hover:bg-slate-50"
                  >
                    <Placa>{v?.placa}</Placa>
                    <span className="truncate text-[13px] text-slate-600">{t?.nome}</span>
                    <span className="ml-auto shrink-0 text-[12px] tabular-nums text-slate-400">
                      saiu {horaDe(r.saida_em) ?? ""}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </Pagina>
  );
}
