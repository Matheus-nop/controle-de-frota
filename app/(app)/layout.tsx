import { Casca } from "@/components/Casca";
import { sessaoAtual } from "@/lib/supabase/papel";

/**
 * Casca de todas as telas de uso diário: barra superior, navegação e rodapé.
 *
 * Fica num route group para que as telas que NÃO levam casca — o login e a
 * ordem de serviço em A4, que vai para a impressora — continuem fora dela sem
 * precisar de gambiarra de caminho. O endereço das páginas não muda: `(app)`
 * não entra na URL.
 *
 * O papel é lido aqui, no servidor, e desce pronto para o menu. Buscar no
 * cliente faria o menu piscar a cada troca de tela.
 */
export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const { papel, nome } = await sessaoAtual();
  return (
    <Casca papel={papel} nome={nome}>
      {children}
    </Casca>
  );
}
