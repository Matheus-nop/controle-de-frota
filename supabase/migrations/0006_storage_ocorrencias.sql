-- Bucket das fotos de ocorrencia. Mesmo desenho dos buckets que ja existem
-- (checklists, roteiros, manutencoes): publico para leitura, escrita so para
-- quem esta logado.
--
-- Arquivo separado de proposito: o SQL editor do Supabase roda cada script em
-- uma transacao. Se a parte de storage falhar por permissao, a criacao da
-- tabela em 0005 nao pode ser desfeita junto.
--
-- Alternativa pelo painel: Storage > New bucket > nome `ocorrencias`, marcar
-- "Public bucket", e adicionar a policy de INSERT para `authenticated`.

insert into storage.buckets (id, name, public)
values ('ocorrencias', 'ocorrencias', true)
on conflict (id) do nothing;

create policy "ocorrencias leitura publica"
  on storage.objects for select
  to public
  using (bucket_id = 'ocorrencias');

create policy "ocorrencias upload autenticado"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ocorrencias');
