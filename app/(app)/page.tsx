import PainelFrota from "@/components/painel/PainelFrota";
import { carregarDados } from "@/lib/frota/data";
import { sessaoAtual } from "@/lib/supabase/papel";

// Server Component: carrega os dados (views do Supabase, com fallback no seed)
// e entrega ao painel. O proxy ja garante que so chega aqui quem esta logado.
export default async function Home() {
  // O papel decide o que aparece: o PCM nao abre Relatorios completos, entao o
  // cartao que leva la sai da tela dele em vez de virar um redirecionamento.
  const [{ dados, referencia, fonte }, { papel }] = await Promise.all([
    carregarDados(),
    sessaoAtual(),
  ]);

  return (
    <>
      {fonte === "seed" && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[13px] text-amber-800">
          Exibindo dados de demonstração (seed). A migração do histórico da planilha
          continua pendente.
        </div>
      )}
      <PainelFrota dados={dados} referencia={referencia} papel={papel ?? "GESTOR"} />
    </>
  );
}
