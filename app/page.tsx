import PainelFrota from "@/components/painel/PainelFrota";
import { carregarDados } from "@/lib/frota/data";

// Server Component: carrega os dados (views do Supabase, com fallback no seed)
// e entrega ao painel. O middleware ja garante que so chega aqui quem esta logado.
export default async function Home() {
  const { dados, referencia, fonte } = await carregarDados();

  return (
    <>
      {fonte === "seed" && (
        <div
          style={{
            background: "#FDF3E0",
            color: "#8A5A00",
            fontSize: 13,
            textAlign: "center",
            padding: "6px 12px",
            borderBottom: "1px solid #F0E0BE",
          }}
        >
          Exibindo dados de demonstracao (seed). A migracao/seed do Supabase e a
          proxima fatia da Fase 3.
        </div>
      )}
      <PainelFrota dados={dados} referencia={referencia} />
    </>
  );
}
