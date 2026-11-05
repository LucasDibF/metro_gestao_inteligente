# Mobile Flutter — entrega incremental

## Escopo aprovado

Android e iPhone, somente sondador. Preservar a experiência do PC, com interface adaptada ao toque. Administrador ou Comercial atribuem obras no web. Execução por metro, solo, dados de campo, fotos pela câmera/galeria, conferência e envio para análise. Umidade permanece informação de campo, sem entrar automaticamente na descrição do relatório; recuperação da amostra foi removida.

## Etapa 1: acesso e atribuição

Base em `apps/mobile`. Login e lista de obras pela API real, sem acesso de teste automático nem contas demonstrativas incorporadas. Cache de consulta por empresa/usuário e sessão protegida. Vínculo de responsabilidade por obra, controle de versão e validação de operador ativo da mesma empresa.

A política de leitura das obras restringe contas exclusivamente de sondador às suas atribuições. O guard verifica a visibilidade antes de encaminhar pedidos a rotas internas de uma obra. O endpoint mobile também filtra a atribuição, inclusive em contas que acumulam responsabilidades.

Critérios: sondador não atribuído não vê/abre a obra; outro sondador não acessa o vínculo; remoção retira a obra das novas consultas; Administrador/Comercial atribuem; Engenheiro sem esses papéis não atribui; versão desatualizada falha; usuário/empresa diferentes não compartilham cache; perda de conexão não transforma erro de autorização em acesso offline.

## Etapa 2: execução offline

Baixar explicitamente obra, pastas e furos. Registrar os mesmos campos do PC em SQLite e manter uma fila local de alterações na mesma transação do registro. UUID local e chave de idempotência por operação, versão de origem e resposta do servidor persistida. Conservar um único registro de ensaio e solo por salvamento, sem duplicar cálculos definitivos do servidor. Primeiro metro sem golpes; encerramentos parciais preservados.

Não permitir sobrescrita silenciosa quando o web alterou o furo. Conflito precisa manter a cópia local e oferecer conferência. Mudança de atribuição durante uma execução offline deve conservar as alterações pendentes, mas não conceder autorização de escrita ao reconectar. Definir um fluxo de recuperação assistida para esses dados antes de liberar a sincronização.

## Etapa 3: fotos

Capturar com permissão solicitada no momento do uso ou selecionar da galeria. Copiar a imagem para armazenamento durável privado do aplicativo, sem depender de caminhos temporários. Metadados no banco e arquivo fora do SQLite. Legenda opcional. Preparar upload com limite e qualidade compatíveis com o processamento atual; retomar sem duplicação. Cancelar a câmera ou negar permissão não perde os dados do furo.

## Etapa 4: entrega ao engenheiro

Distinguir sincronizar de enviar para análise. A sincronização confirma persistência e mantém o rascunho. O envio exige confirmação de todos os dados e fotos no servidor e bloqueia a edição, respeitando a devolução pelo engenheiro. Estado do envio deve ser reconciliado após timeout antes de permitir uma nova tentativa.

## Testes de aceite do MVP completo

Executar em Android e iPhone: fechar/reabrir no meio do preenchimento, operar em modo avião, interromper uploads, renovar sessão, alternar usuários, alterar dados no web simultaneamente, retirar atribuição, completar penetração parcial, negar câmera, faltar armazenamento e devolver o furo para correção. Não liberar para campo somente com testes de unidade ou mockups.

Detalhes de execução, componentes e limitações em `apps/mobile/README.md`. A migração foi testada em transação descartável e aplicada somente ao banco isolado de testes nesta etapa; registrar separadamente eventual ativação no ambiente local principal.

## Implementação e evidências em 04/11/2026

- Acesso, atribuição, catálogo por pastas e furos: implementados. O catálogo, o snapshot e as mutações mobile exigem atribuição ativa, inclusive em contas com mais de um perfil.
- Editor conjunto SPT/solo, dados de campo e coordenadas: implementados. Primeiro metro sem golpes, descrição e cor opcionais, repetição do solo anterior e interrupções com avanços restantes vazios.
- SQLite: documento e fila na mesma transação; rascunho de metro não confirmado preservado. Persistência após reabertura e isolamento de conta testados.
- Sincronização: versão sob bloqueio no servidor, UUID e recibo durável no mesmo commit dos dados. Resposta perdida não duplica operação. Conteúdo diferente com o mesmo UUID é recusado.
- Conflitos/revogação: fila e cópia local permanecem intactas. Exportação assistida permite compartilhar dados e fotos para conferência, sem sobrescrever o servidor.
- Fotografias: câmera/galeria, arquivos duráveis, legenda opcional, upload idempotente, processamento existente e visualização autenticada. Recuperação de Activity Android implementada, ainda pendente de teste em aparelho real.
- Conferência/envio: checklist da API; sincronizar mantém rascunho; enviar bloqueia edição até devolução. Timeout de envio é reconciliado por recibo.
- Migração 35 `202611040002_mobile_sync` aplicada somente a `spt_test`. Nenhum banco principal foi migrado automaticamente.
- Análise Flutter: sem problemas. Quatorze testes Flutter aprovados, incluindo SQLite real. Dois testes HTTP de atribuição e sincronização aprovados com dados descartáveis; cobrem versão, duplicação concorrente, penetração parcial, legenda vazia, envio e revogação.
- Compilação TypeScript da API e worker concluída. API de teste na porta 4000 e processamento de fotos em execução.
- Android não homologado; licenças SDK pendentes. Sem publicação.

## Teste nativo e layout em 05/11/2026

Última verificação sobre o código do commit `a25c4bc`, com as correções de fila, sessão e fotografias. API e processamento de fotos em `spt_test`, furo sintético novo a cada execução:

- iPhone 18 Pro/iOS 27.0, `integration_test/field_flow_test.dart`: aprovado. Login, obra, furo, solo inicial, metro com golpes, dados de campo, sincronização real e conferência.
- iPhone 18 Pro/iOS 27.0, `integration_test/photo_delivery_test.dart`: aprovado. Fotografia enviada, processada pelo worker e exibida; envio para análise bloqueia a edição.
- iPad mini/iOS 27.0, `field_flow_test.dart`: aprovado, com o trilho lateral de seções. O `+2` do log conta o caso do fluxo e o `tearDownAll` do binding de integração, como nos logs do iPhone; `photo_delivery_test.dart` não foi executado no iPad.
- `flutter analyze`: sem problemas. 246 testes Flutter aprovados, sendo 126 de matriz de telas (sete tamanhos, texto a 100% e 200%, teclado aberto e áreas seguras).
- `tests/integration/mobile-sync.test.ts` e `field-assignments.test.ts`: aprovados em `spt_test`.
- Android: `flutter build apk --debug` compila. O aplicativo não foi instalado nem executado em emulador ou aparelho, e as licenças de SDK seguem pendentes.

A compilação nativa deve ser feita em cópia fora de `Documents`: nessa pasta os atributos estendidos do macOS fazem a assinatura de `Flutter.framework` falhar ("resource fork, Finder information, or similar detritus not allowed").

Correções encontradas ao comparar documento e código: catálogo offline com pastas falhava ao abrir (lista JSON convertida com tipo incorreto); um campo obrigatório fora da área visível do formulário não era validado, porque a lista só mantinha os campos visíveis; o novo metro continuava disponível depois do encerramento do furo, contrariando o aviso exibido.

Correções da auditoria de qualidade, sem novo teste nativo:

- O teste do campo obrigatório só cobria a janela estreita a 200%, em que o botão entra na rolagem. O novo teste toca o botão fixo sem rolar, em telefone e tablet a 100% e 200% (`test/responsive_structure_test.dart`). Com o formulário trocado por uma lista preguiçosa, ele falha em seis das oito combinações; com o código atual, passa.
- Com sessão válida, 5xx e 429 na lista de obras e no catálogo da obra mostravam erro mesmo com cópia salva. Agora usam a cópia dentro do período offline; 401 continua encerrando a sessão e 403 e 404 continuam como erro de acesso (`test/offline_read_failures_test.dart`).
- O aviso de download dizia "1 furos disponíveis". A contagem agora concorda com o número (`test/work_contents_test.dart` e `test/field_consistency_test.dart`).

As migrações `202611050001_flow_and_access_corrections` e `202611050002_change_own_password` foram aplicadas a `spt_test` por `psql`, com registro em `_prisma_migrations`, porque `prisma migrate deploy` travou sem mensagem nesta máquina. O motivo do travamento não foi identificado.

Testes de aceite por situação:

| Situação | Situação atual |
|---|---|
| Fechar e reabrir no meio do preenchimento | Teste com SQLite real; falta aparelho |
| Modo avião | Teste com rede simulada; falta aparelho, inclusive período prolongado |
| Interromper envio | Resposta perdida e reconciliação testadas; falta aparelho durante upload de foto |
| Renovar sessão, alternar usuários | Testes Flutter |
| Alteração simultânea no web, retirada de atribuição | Testes Flutter e HTTP |
| Penetração parcial | Testes Flutter e HTTP |
| Devolução para correção | Teste Flutter de repositório; falta fluxo completo com o web |
| Negar câmera | Teste de tela com seletor simulado; falta permissão real em aparelho |
| Falta de armazenamento | Mensagem implementada, sem teste; depende de aparelho |
| Recuperação de Activity Android | Implementada, sem teste; depende de aparelho Android |

A implementação permite validação local do fluxo de sondador. A liberação para campo depende da matriz de testes de dispositivos reais descrita acima, especialmente câmera, suspensão, armazenamento e uso offline prolongado.
