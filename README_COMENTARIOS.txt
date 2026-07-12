PROJETO COMENTADO - EMPRÉSTIMOS PRO

Este ZIP contém o mesmo sistema, porém com comentários no código para facilitar manutenção.

Arquivo principal:
- js/app.js: concentra a lógica principal do sistema. Cada função recebeu comentário explicando o que faz.

Arquivos visuais:
- index.html: estrutura das abas e campos.
- css/style.css: visual principal.
- css/dark.css: modo escuro.
- css/print.css: regras de impressão.

Lógica do Dashboard:
- Capital investido: salvo em db.settings.capitalInvestido e também na chave localStorage "capitalInvestido".
- Percentual dos juros: salvo em db.settings.percentualJuros50 e também na chave localStorage "percentualJuros50".
- Valor emprestado: soma apenas dos vales em aberto.
- Valor em caixa: capital investido - valor emprestado.
- Total de juros: soma dos juros apenas dos vales em aberto.
- Quando um vale é marcado como PAGO, ele sai dos cálculos em aberto.
