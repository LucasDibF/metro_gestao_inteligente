# E14 — Leituras parciais no gráfico da tela e do PDF

Correção local da ausência visual do último metro na análise e no PDF. Não altera medições, N-SPT salvo, classificação ou versão do cálculo aritmético.

## Contrato compartilhado

`sptGraphReading`, no motor isolado, fornece coordenada e rótulo medidos para as duas séries. O caso informado com golpes 30/30/30, penetrações salvas 150/140/150 mm e N-SPT null produz **60/29** nas duas séries: soma de golpes sobre penetração executada em centímetros. Não há normalização para 30 cm, N-SPT definitivo ou classe inventada.

Leituras não convencionais usam losangos e rótulos nas cores das séries, isolados da linha convencional. Não unem o segmento anterior ou seguinte. Um único avanço de 30 golpes em 14 cm aparece como **30/14** somente na primeira série; não fabrica par final. Registros INVALID/NOT_TESTED não viram pontos de ensaio. Valores brutos permanecem consultáveis.

## Tela e documento

A geometria e identidade existentes permanecem. Rótulos em limites de trecho, como 20/40 m, são contidos dentro do quadro. Na tela, o rótulo terminal é deslocado para baixo para evitar sobreposição. Seleção e descrição acessível distinguem leitura parcial de N-SPT convencional.

Template novo **0.8.8** aplica a correção ao PDF; versões 0.8.7 e anteriores suportadas e emissões históricas são preservadas. Não há regravação de documentos antigos nem mudança de aprovação técnica.

## Evidência em andamento

87 testes unitários passaram; um teste adicional de limite estava em execução. Um teste de navegador de análise passou inicialmente e estava em repetição após ajuste de layout. As 16 integrações estavam em execução, sem resultado final presumido. PDF sintético de quatro páginas passou por preflight, renderização e inspeção visual. O material de teste não é documento real ou comprovação de conformidade normativa global.

Fechamento: 88 testes unitários e a verificação de tipos aprovados. Teste de análise no navegador aprovado após reposicionar rótulos terminais. As duas integrações que excederam limites de tempo sob execução concorrente foram repetidas isoladamente e passaram; as outras 14 passaram na rodada ampliada. PDF sintético de quatro páginas renderizado/inspecionado e preflight adicional aprovado para parciais nas fronteiras de 20 e 40 m. As verificações anteriores do perfil foram restauradas sem remover asserções. Serviços locais reiniciados com template 0.8.8; registros do usuário não foram regravados. PDFs já emitidos permanecem imutáveis: gerar nova emissão para usar a correção.

## Direção final solicitada pelo usuário

O usuário esclareceu que deseja somente a continuidade das linhas até o último metro, sem losangos, rótulos ou anotações no gráfico. A análise agora conecta leituras adjacentes com os mesmos círculos anteriores. O PDF 0.8.9 segue essa apresentação, preservando a renderização histórica 0.8.8. Dados medidos, somatórios e N-SPT não foram modificados. Verificação: 89 testes unitários, teste de navegador da análise e preflight/inspeção do PDF, incluindo fronteiras de 20/40 m.
