"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { emKm, paraInteiro } from "@/lib/frota/numero";
import { enviarFoto } from "@/lib/frota/foto";
import {
  Aviso,
  Botao,
  BotaoLink,
  Campo,
  CampoNumero,
  Cartao,
  Carregando,
  Input,
  Pagina,
  Select,
} from "@/components/ui";

type Veiculo = { id: string; placa: string; modelo: string; km_atual: number | null };
type Tecnico = { id: string; nome: string };

export default function RegistrarSaidaPage() {
  const [veiculos, setVeiculos] = useState<Veiculo[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [carregandoDados, setCarregandoDados] = useState(true);

  const [veiculoId, setVeiculoId] = useState("");
  const [tecnicoId, setTecnicoId] = useState("");
  const [km, setKm] = useState("");
  const [obs, setObs] = useState("");
  const [foto, setFoto] = useState<FileList | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      await supabase.auth.getUser();
      const [v, t] = await Promise.all([
        supabase
          .from("veiculos")
          .select("id, placa, modelo, km_atual")
          .eq("status", "ATIVO")
          .order("placa"),
        supabase.from("tecnicos").select("id, nome").eq("ativo", true).order("nome"),
      ]);
      setVeiculos((v.data as Veiculo[]) ?? []);
      setTecnicos((t.data as Tecnico[]) ?? []);
      setCarregandoDados(false);
    })();
  }, []);

  const veiculoSel = veiculos.find((x) => x.id === veiculoId);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const kmNum = paraInteiro(km);
    if (!veiculoId || !tecnicoId || kmNum == null) {
      setErro("Preencha veículo, técnico e o km de saída.");
      return;
    }
    if (veiculoSel?.km_atual != null && kmNum < veiculoSel.km_atual) {
      setErro(
        `O km de saída (${emKm(kmNum)}) é menor que o último km do veículo ` +
          `(${emKm(veiculoSel.km_atual)}). Confira o hodômetro.`,
      );
      return;
    }

    setSalvando(true);
    try {
      const supabase = createClient();

      const fotoUrl = await enviarFoto(supabase, "roteiros", `${veiculoId}/saida`, foto?.[0]);

      const { error } = await supabase.from("roteiros").insert({
        veiculo_id: veiculoId,
        tecnico_saida_id: tecnicoId,
        saida_em: new Date().toISOString(),
        km_saida: kmNum,
        obs_saida: obs.trim() || null,
        foto_painel_saida: fotoUrl,
      });

      if (error) {
        if (error.code === "23505") {
          setErro(
            "Já existe um roteiro ABERTO para este veículo. Registre a chegada dele antes de abrir um novo.",
          );
        } else {
          setErro(error.message);
        }
        setSalvando(false);
        return;
      }
      setOk(true);
      setSalvando(false);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar a saída.");
      setSalvando(false);
    }
  }

  return (
    <Pagina
      estreita
      titulo="Registrar saída"
      subtitulo="Abre um roteiro para o veículo. A chegada é registrada depois."
    >
      <Cartao className="p-5">
        {ok ? (
          <div>
            <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-emerald-50 px-3.5 py-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
              <CheckCircle2 size={18} className="mt-px shrink-0" />
              <span>
                <b>Saída registrada.</b> O veículo está na rua.
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Botao
                tamanho="lg"
                className="flex-1"
                onClick={() => {
                  setOk(false);
                  setVeiculoId("");
                  setTecnicoId("");
                  setKm("");
                  setObs("");
                  setFoto(null);
                }}
              >
                Registrar outra saída
              </Botao>
              <BotaoLink href="/campo" variante="primario" tamanho="lg" className="flex-1">
                Voltar ao início
              </BotaoLink>
            </div>
          </div>
        ) : carregandoDados ? (
          <Carregando texto="Carregando veículos e técnicos…" />
        ) : (
          <form onSubmit={salvar} className="space-y-3.5">
            <Campo rotulo="Veículo">
              <Select required value={veiculoId} onChange={(e) => setVeiculoId(e.target.value)}>
                <option value="">Selecione…</option>
                {veiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.modelo} — {v.placa}
                    {v.km_atual != null ? ` (${v.km_atual} km)` : ""}
                  </option>
                ))}
              </Select>
            </Campo>

            <Campo rotulo="Técnico">
              <Select required value={tecnicoId} onChange={(e) => setTecnicoId(e.target.value)}>
                <option value="">Selecione…</option>
                {tecnicos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </Select>
            </Campo>

            <CampoNumero
              rotulo="Km de saída"
              unidade="km"
              required
              valor={km}
              onValor={setKm}
              placeholder="ex.: 66402"
              dica={
                veiculoSel?.km_atual != null
                  ? `Último km deste veículo: ${emKm(veiculoSel.km_atual)}.`
                  : undefined
              }
            />

            <Campo rotulo="Foto do painel / hodômetro (opcional)">
              <Input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => setFoto(e.target.files)}
                className="file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-slate-700"
              />
            </Campo>

            <Campo rotulo="Observação (opcional)">
              <Input
                type="text"
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="algo a registrar na saída"
              />
            </Campo>

            <Botao type="submit" variante="primario" tamanho="lg" disabled={salvando} className="w-full">
              {salvando ? "Registrando…" : "Registrar saída"}
            </Botao>

            {erro && <Aviso>{erro}</Aviso>}
          </form>
        )}
      </Cartao>
    </Pagina>
  );
}
