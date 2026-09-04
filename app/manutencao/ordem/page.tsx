"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Ordem de serviço para imprimir e entregar ao técnico.
//
// O papel serve para uma coisa: alguém que não está olhando o app saber o que
// levar, o que fazer e o que anotar de volta. Por isso ele tem duas metades —
// o que o sistema já sabe (veículo, km, o que foi pedido) vem impresso, e o
// que só vai existir na oficina (peças, valor, km de entrega) vem em branco,
// com linha para escrever à mão.
//
// Nada aqui grava nada. Depois de executado, quem lança o resultado é o
// gestor/PCM em /manutencao — é lá que o dado entra no banco. O papel é o
// caminho de ida, não uma segunda fonte de verdade.

type Manut = {
  id: string;
  aberta_em: string | null;
  km_abertura: number | null;
  origem: string | null;
  tipo: string | null;
  descricao_problema: string;
  prioridade: string | null;
  oficina: string | null;
  orcamento: number | null;
  status: string;
  proxima_revisao_km: number | null;
  veiculo: Veic | Veic[] | null;
  responsavel: { nome: string } | { nome: string }[] | null;
};
type Veic = {
  placa: string; modelo: string; ano: string | null;
  km_atual: number | null; proxima_revisao_km: number | null;
};

function one<T>(rel: T | T[] | null): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}
function dataBR(s: string | null) {
  return s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "__/__/____";
}
function nkm(n: number | null | undefined) {
  return n == null ? "____________" : n.toLocaleString("pt-BR") + " km";
}
function brl(n: number | null | undefined) {
  return n == null ? "____________" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
// Nº da ordem: os 8 primeiros do uuid, em maiúsculas. Curto o bastante para
// alguém ditar no telefone e ainda achar a ordem certa numa frota de 9.
function numero(id: string) {
  return id.slice(0, 8).toUpperCase();
}

// Bloco com linha para preencher à mão na oficina.
function Campo({ rotulo, largura = "1fr", linhas = 1 }: { rotulo: string; largura?: string; linhas?: number }) {
  return (
    <div style={{ gridColumn: `span ${largura === "1fr" ? 1 : 2}` }}>
      <div className="rot">{rotulo}</div>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="linha-escrita" />
      ))}
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className="rot">{rotulo}</div>
      <div className="val">{valor}</div>
    </div>
  );
}

function Ordem() {
  const params = useSearchParams();
  const id = params.get("id");
  const [m, setM] = useState<Manut | null>(null);
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
          "*, veiculo:veiculo_id(placa,modelo,ano,km_atual,proxima_revisao_km), responsavel:responsavel_id(nome)",
        )
        .eq("id", id)
        .maybeSingle();
      setM((data as Manut) ?? null);
      setEstado(data ? "ok" : "vazio");
    })();
  }, [id]);

  if (estado === "carregando") {
    return <p style={{ padding: 24, color: "#53607A" }}>Carregando a ordem…</p>;
  }
  if (!m) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: "#53607A" }}>Ordem de serviço não encontrada.</p>
        <a href="/manutencao" style={{ color: "#2B4C8C" }}>← Voltar para Manutenções</a>
      </div>
    );
  }

  const v = one(m.veiculo);
  const resp = one(m.responsavel);
  const programada = m.origem === "PREVENTIVA PROGRAMADA" || m.tipo === "PREVENTIVA";

  return (
    <>
      <style>{CSS}</style>

      <div className="barra">
        <a href="/manutencao">← Manutenções</a>
        <button onClick={() => window.print()}>🖨 Imprimir</button>
      </div>

      <div className="folha">
        <header className="topo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Grupo Nova Opção" className="logo" />
          <div className="titulo">
            <h1>Ordem de serviço {programada ? "— manutenção programada" : "— manutenção"}</h1>
            <div className="sub">Controle de Frota · Grupo Nova Opção</div>
          </div>
          <div className="numero">
            <div className="rot">Ordem nº</div>
            <div className="os">{numero(m.id)}</div>
            <div className="rot">Aberta em {dataBR(m.aberta_em)}</div>
          </div>
        </header>

        <section className="bloco">
          <h2>Veículo</h2>
          <div className="grade">
            <Dado rotulo="Placa" valor={v?.placa ?? "—"} />
            <Dado rotulo="Modelo" valor={v?.modelo ?? "—"} />
            <Dado rotulo="Ano" valor={v?.ano ?? "—"} />
            <Dado rotulo="Km na abertura" valor={nkm(m.km_abertura ?? v?.km_atual)} />
          </div>
        </section>

        <section className="bloco">
          <h2>A ordem</h2>
          <div className="grade">
            <Dado rotulo="Tipo" valor={m.tipo ?? "—"} />
            <Dado rotulo="Origem" valor={m.origem ?? "—"} />
            <Dado rotulo="Prioridade" valor={m.prioridade ?? "—"} />
            <Dado rotulo="Situação" valor={m.status} />
            <Dado rotulo="Oficina" valor={m.oficina ?? "a definir"} />
            <Dado rotulo="Solicitante" valor={resp?.nome ?? "—"} />
            <Dado rotulo="Orçamento aprovado" valor={brl(m.orcamento)} />
            <Dado
              rotulo="Próxima revisão"
              valor={nkm(m.proxima_revisao_km ?? v?.proxima_revisao_km)}
            />
          </div>
        </section>

        <section className="bloco">
          <h2>O que fazer</h2>
          <p className="descricao">{m.descricao_problema}</p>
        </section>

        <section className="bloco preencher">
          <h2>Para a oficina preencher</h2>
          <div className="grade grade-2">
            <Campo rotulo="Serviços realizados" largura="2fr" linhas={4} />
            <Campo rotulo="Peças substituídas (descrição e quantidade)" largura="2fr" linhas={4} />
          </div>
          <div className="grade">
            <Campo rotulo="Entrada na oficina (data e hora)" />
            <Campo rotulo="Saída da oficina (data e hora)" />
            <Campo rotulo="Km na entrega" />
            <Campo rotulo="Valor final (R$)" />
          </div>
          <div className="grade grade-2">
            <Campo rotulo="Pendências / o que ficou para a próxima" largura="2fr" linhas={2} />
          </div>
        </section>

        <section className="assinaturas">
          <div>
            <div className="risco" />
            <div className="rot">Responsável pela oficina</div>
          </div>
          <div>
            <div className="risco" />
            <div className="rot">Técnico que entregou o veículo</div>
          </div>
          <div>
            <div className="risco" />
            <div className="rot">Conferido por (PCM / gestor)</div>
          </div>
        </section>

        <footer className="rodape">
          Ordem {numero(m.id)} · {v?.placa ?? "—"} · impressa em {dataBR(new Date().toISOString().slice(0, 10))}.
          Depois de executada, lance o resultado em Manutenções — o papel não atualiza o sistema.
        </footer>
      </div>
    </>
  );
}

export default function OrdemPage() {
  // useSearchParams exige Suspense na build estática do App Router.
  return (
    <Suspense fallback={<p style={{ padding: 24, color: "#53607A" }}>Carregando…</p>}>
      <Ordem />
    </Suspense>
  );
}

const CSS = `
.barra{max-width:820px;margin:0 auto;padding:16px 20px 0;display:flex;align-items:center;gap:12px}
.barra a{font-size:13px;color:#2B4C8C;text-decoration:none;font-weight:600}
.barra button{margin-left:auto;padding:9px 16px;border-radius:9px;border:none;background:#2B4C8C;color:#fff;font-size:13.5px;font-weight:600;cursor:pointer}

.folha{max-width:820px;margin:16px auto 40px;background:#fff;border:1px solid #DBE0EA;border-radius:12px;padding:28px 30px;
  color:#16233C;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}

.topo{display:flex;align-items:flex-start;gap:18px;border-bottom:2px solid #16233C;padding-bottom:14px;margin-bottom:18px}
.logo{height:38px}
.titulo h1{font-size:16px;margin:0;letter-spacing:-.01em}
.titulo .sub{font-size:11.5px;color:#53607A;margin-top:3px}
.numero{margin-left:auto;text-align:right}
.numero .os{font-size:19px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:.03em}

.bloco{margin-bottom:18px;break-inside:avoid}
.bloco h2{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#53607A;margin:0 0 9px;
  border-bottom:1px solid #DBE0EA;padding-bottom:5px}
.grade{display:grid;grid-template-columns:repeat(4,1fr);gap:12px 18px}
.grade-2{grid-template-columns:repeat(2,1fr)}
.rot{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#8591A5;font-weight:700}
.val{font-size:14px;font-weight:600;margin-top:2px}
.descricao{font-size:14.5px;line-height:1.55;margin:0;white-space:pre-wrap}

.preencher .rot{color:#53607A}
.linha-escrita{border-bottom:1px solid #AEB8C6;height:22px;margin-top:6px}

.assinaturas{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:34px;break-inside:avoid}
.risco{border-top:1px solid #16233C;margin-bottom:5px}
.rodape{margin-top:22px;padding-top:10px;border-top:1px solid #DBE0EA;font-size:10.5px;color:#8591A5;line-height:1.5}

@media print{
  .barra{display:none}
  body{background:#fff}
  .folha{max-width:none;margin:0;border:none;border-radius:0;padding:0}
  @page{size:A4;margin:14mm}
}
`;
