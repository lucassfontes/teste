# Notificações push de vales vencidos

O projeto já contém toda a integração do celular. Para colocar em funcionamento no Supabase:

## 1. Criar as tabelas
No Supabase, abra **SQL Editor**, cole e execute `supabase/PUSH_NOTIFICATIONS_SETUP.sql`.

## 2. Criar a Edge Function
Instale a Supabase CLI e, na pasta do projeto, execute:

```bash
supabase functions deploy send-due-push --no-verify-jwt
```

A função está em `supabase/functions/send-due-push/index.ts`.

## 3. Configurar os segredos
A chave pública já está em `js/supabase-config.js`. Configure no Supabase:

```bash
supabase secrets set VAPID_PUBLIC_KEY="BIztGbmg0yQ9DNMpdPkdgMIPzL1IosffrycFOK0doFz_zpV73hcNbMbVeqzYjKGkAbrFuA5LCN7eM8RXIpzddP4"
supabase secrets set VAPID_PRIVATE_KEY="COLE_A_CHAVE_PRIVADA_ENTREGUE_SEPARADAMENTE"
supabase secrets set VAPID_SUBJECT="mailto:SEU_EMAIL_AQUI"
supabase secrets set CRON_SECRET="CRIE_UMA_SENHA_GRANDE_AQUI"
```

Não coloque a chave privada VAPID dentro dos arquivos públicos hospedados.

## 4. Agendar o envio diário
No painel Supabase, abra **Integrations > Cron** e crie uma chamada HTTP diária, por exemplo às 08:00:

- Método: `POST`
- URL: `https://ptvmotwhwutlsffjyclt.supabase.co/functions/v1/send-due-push`
- Cabeçalho: `x-cron-secret: A_MESMA_SENHA_DO_CRON_SECRET`
- Agenda cron para 08:00 de Bruxelas no verão: `0 6 * * *` (o agendador usa UTC)

Também pode executar a função manualmente para testar.

## 5. Ativar em cada celular
Entre no VALLE, abra **Notificações** e toque em **ATIVAR NOTIFICAÇÕES**.

No iPhone, primeiro abra no Safari, toque em **Compartilhar > Adicionar à Tela de Início**, abra o VALLE pelo ícone instalado e então ative. O site precisa estar publicado em HTTPS.

## Comportamento
- avisa vales que vencem hoje e vales atrasados;
- funciona com o PWA fechado;
- envia uma vez por vale por aparelho a cada dia;
- tocar na notificação abre a aba de notificações;
- inscrições inválidas são desativadas automaticamente.
