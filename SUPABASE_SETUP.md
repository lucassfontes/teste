# Configuração do Supabase — VALLE

1. Crie um projeto no Supabase.
2. Abra o **SQL Editor** e execute `supabase/schema.sql`.
3. Em **Authentication > Users**, crie o primeiro usuário administrador.
4. Copie o UUID desse usuário e execute no SQL Editor:

```sql
insert into public.profiles(id,name,email,role,active)
values ('UUID_DO_USUARIO','Administrador','SEU_EMAIL','admin',true);
```

5. Instale a CLI do Supabase e publique a função:

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase functions deploy manage-user
```

A função usa automaticamente `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` no ambiente hospedado. Nunca coloque a `SERVICE_ROLE_KEY` no navegador.

6. Edite `js/supabase-config.js` e informe somente:
   - URL do projeto;
   - chave pública anon/publishable.
7. Hospede o sistema em HTTPS (Supabase Storage, Netlify, Vercel, GitHub Pages etc.).

## Hierarquia
- **ADM:** cria/edita usuários de sessão e vê a hierarquia, sem acesso aos dados financeiros.
- **SESSÃO:** cria usuários de serviço, define permissões e pode consultar os dados de sua hierarquia.
- **SERVIÇO:** usa o dashboard normal e grava seus dados em `workspace_states`.

## Validade
Quando `valid_until` do usuário de sessão vence, ele e todos os seus usuários de serviço são impedidos de entrar. O ADM renova a data para reativar a hierarquia.


## Hierarquia obrigatória
- O administrador cria e administra somente usuários de sessão; pode definir validade, WhatsApp, ativar e bloquear.
- O usuário de sessão cria e administra somente usuários de serviço; pode definir permissões, ativar e bloquear.
- Após atualizar esta versão, publique novamente a função: `supabase functions deploy manage-user`.


## Sincronização de todos os dados
A tabela `workspace_states` guarda, no campo JSONB `data`, o banco completo de cada usuário de serviço:
- configurações do sistema;
- clientes;
- vales;
- pagamentos totais e parciais;
- observações;
- histórico financeiro e informações usadas nos relatórios.

Depois de atualizar para esta versão, execute novamente `supabase/schema.sql` no SQL Editor. O arquivo é idempotente e atualiza também a política RLS de `profiles` sem apagar dados existentes.

No primeiro login de cada usuário de serviço:
- se já existir uma cópia no Supabase, ela será carregada;
- se não existir, os dados locais atuais serão enviados automaticamente.

Cada alteração salva no sistema é enviada ao Supabase automaticamente. O `localStorage` permanece somente como cache/cópia local para carregamento rápido e funcionamento temporário quando a internet oscilar.


## Dados compartilhados por sessão

Execute novamente todo o arquivo `supabase/schema.sql` no SQL Editor. Ele cria a tabela `session_workspaces`.

- Cada usuário de sessão possui um único banco de dados operacional.
- Todos os usuários de serviço vinculados à mesma sessão carregam e salvam os mesmos clientes, vales, pagamentos, histórico e configurações.
- Sessões diferentes não conseguem ler nem alterar os dados umas das outras por causa das políticas RLS.
- Na migração, caso existam vários bancos antigos na mesma sessão, será copiado automaticamente o registro modificado mais recentemente.
- A tabela antiga `workspace_states` é mantida apenas para compatibilidade e não é mais usada pela aplicação.

Para conferir, abra `Table Editor > session_workspaces`. Deve existir uma linha por usuário de sessão, e não uma linha por usuário de serviço.

## Tema individual por usuário
Execute novamente todo o arquivo `supabase/schema.sql` no SQL Editor.
A atualização cria a coluna `profiles.user_theme` e a função segura `set_my_theme`.
O tema claro/escuro passa a ser salvo individualmente para cada usuário e não é compartilhado com os demais usuários da sessão.


## Juros individuais por usuário de serviço

Execute novamente todo o arquivo `supabase/schema.sql` no SQL Editor. Ele adiciona em `service_permissions` os campos:

- `interest_percent`: percentual de juros padrão do usuário;
- `late_fee_type`: tipo da taxa de atraso (`percentual` ou `reais`);
- `late_fee_value`: valor diário da taxa de atraso.

Essas configurações são definidas pelo usuário de sessão ao criar ou editar cada usuário de serviço. Elas não ficam mais nas configurações gerais da sessão e não são compartilhadas entre usuários de serviço. O capital investido e os dados de clientes/vales continuam compartilhados pela sessão.

## Funcionamento offline

Depois que um usuário entrar ao menos uma vez com internet neste aparelho, o VALLE mantém localmente a sessão, o perfil, as permissões e o banco compartilhado da sessão.

- Sem internet, clientes, VALLES, pagamentos, histórico e configurações continuam funcionando.
- Cada alteração é salva imediatamente no aparelho e marcada como pendente.
- Quando a conexão retorna, o sistema envia automaticamente a versão pendente para `session_workspaces` no Supabase.
- Ações administrativas (criar, excluir, bloquear usuários ou alterar permissões) exigem internet.
- O primeiro login de cada usuário em um aparelho também exige internet.

O modelo atual usa um documento JSON compartilhado por sessão. Quando dois aparelhos alteram o mesmo banco enquanto ambos estão offline, a última versão que conseguir sincronizar será a versão mantida no Supabase.
