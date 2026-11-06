# E18 — Correções da revisão e do conteúdo técnico do PDF

Modelo novo: **0.8.14**. Emissões e snapshots de versões anteriores continuam com a renderização original.

## Revisão

- Enviar e aprovar exigem registro em todos os metros, de 1 até a linha final da profundidade executada. A falta gera `SPT_METRES_MISSING`, com os metros na resposta, e o checklist ganha o item `metres`. Furos já aprovados não mudam.
- Metro interrompido sem avanços passa a valer como registro, desde que tenha motivo. É o caminho para um metro sem ensaio.
- Zero golpes (`REQUIRES_REVIEW`) continua sem bloquear: fica para o parecer do engenheiro e não gera N-SPT, conforme E05 e MVP-001.

## PDF 0.8.14

- "Motivo da paralisação" mostra o motivo gravado no último ensaio. Acima de 90 caracteres, remete às observações, para não quebrar o layout.
- Quando há metro sem N-SPT na curva, uma nota informa que o ponto é leitura medida. A curva continua como pedido em E14, sem marcas no gráfico.
- Metro com dois grupos de solo fica sem compacidade ou consistência, como na tela.

## Compatibilidade

Logo, capa, cabeçalho e rodapé da empresa usam `templateSince(..., '0.8.13')`, para continuar ativos em versões novas. API e worker precisam ser reiniciados juntos: worker antigo recusa snapshot 0.8.14.
