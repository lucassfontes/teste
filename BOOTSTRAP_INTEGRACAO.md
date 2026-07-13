# Integração Bootstrap do VALLE

O projeto inclui localmente, sem depender da internet para a interface:

- Bootstrap 5.3.6 (`vendor/bootstrap`)
- Bootstrap Icons (`vendor/bootstrap-icons`)
- Camada de compatibilidade (`css/bootstrap-integration.css`)
- Conversão segura de emojis visuais para Bootstrap Icons (`js/bootstrap-enhance.js`)

A integração foi feita de forma progressiva: o CSS original do VALLE continua sendo carregado depois do Bootstrap e permanece responsável pela identidade visual. Isso evita alterar IDs, eventos, regras de negócio, Supabase, modo offline e sincronização.

Os arquivos das bibliotecas também foram adicionados ao `service-worker.js`, portanto ficam disponíveis offline após a instalação/primeiro carregamento do PWA.
