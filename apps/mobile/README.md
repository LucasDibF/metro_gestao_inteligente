# Metro · Campo

Aplicativo Flutter para Android e iPhone, exclusivo do sondador. Administrador ou Comercial atribuem as obras no web. Análise geotécnica, aprovação, assinatura, cadastro administrativo e emissão de PDF continuam no sistema web.

## Fluxo disponível

1. Entrar com empresa, e-mail, senha e MFA, quando habilitado.
2. Abrir uma obra atribuída, navegar pelas pastas e pelos furos. Furos sem pasta aparecem diretamente.
3. Usar **Baixar obra para usar offline** antes de sair para campo. Abrir um furo online também salva seu conteúdo no aparelho.
4. Na aba **Metros**, preencher SPT e solo juntos. O primeiro metro registra apenas o solo e o método, sem golpes. Nos seguintes, informar golpes e centímetros por avanço; os avanços seguintes podem ficar vazios quando houver interrupção justificada. Tipo de solo obrigatório; cor, umidade e descrição complementar opcionais. O botão de repetir utiliza o tipo e a cor do metro anterior.
5. Na aba **Campo**, registrar data, profundidade final, nível d’água e coordenada UTM executada. A coordenada oficial do relatório continua obedecendo ao processo existente no web.
6. Na aba **Fotos**, usar câmera ou galeria. Legenda opcional; categorias compatíveis com o relatório. Fotografias são copiadas para arquivos privados duráveis antes de confirmar o salvamento.
7. **Sincronizar** envia os registros e mantém o rascunho aberto. A aba **Conferência** usa as verificações definitivas da API.
8. **Concluir e enviar para análise** exige conexão, fila confirmada, dados válidos e fotografias processadas. Depois do envio, o sondador não edita até uma devolução pelo engenheiro.

Umidade não é acrescentada automaticamente à descrição do PDF. Recuperação da amostra não faz parte dos campos. O motor geotécnico e os cálculos definitivos permanecem no servidor.

## Organização

| Diretório | Responsabilidade |
|---|---|
| `lib/auth` | Login, perfil OPERATOR, sessão, renovação e armazenamento seguro |
| `lib/bootstrap.dart` | Endereço da API e tela de erro de configuração |
| `lib/core` | HTTP, upload, imagens autenticadas e erros |
| `lib/works` | Obras atribuídas, pastas, furos e download explícito |
| `lib/field/field_store.dart` | SQLite, documentos e fila transacional |
| `lib/field/field_store_schema.dart` | Tabelas SQLite e migrações |
| `lib/field/field_repository.dart` | Operações locais, em série por furo, um repositório por conta |
| `lib/field/field_sync.dart` | Envio da fila, recusas e conferência de versão |
| `lib/field/field_document.dart` | Documento local a partir do snapshot e dos recibos |
| `lib/field/photo_paths.dart` | Caminho relativo das fotografias |
| `lib/field/metre_editor.dart` | Registro conjunto por metro; `metre_advance_panel.dart` e `metre_soil_fields.dart` são suas seções, `metre_advances.dart` valida os avanços |
| `lib/field/field_forms.dart` | Dados de campo |
| `lib/field/coordinate_form.dart` | Coordenada executada |
| `lib/field/photo_capture.dart` | Captura e seleção de imagens |
| `lib/field/photo_recovery.dart` | Arquivos duráveis e recuperação de câmera Android |
| `lib/field/hole_screen.dart` | Estado e navegação do furo; `hole_*_tab.dart` são as quatro seções, `hole_section_nav.dart` a barra ou trilho, `hole_status_strip.dart` o estado de sincronização |
| `lib/field/field_export.dart` | Cópia assistida dos dados pendentes |
| `lib/ui/metro_theme.dart` | Paleta clara e escura, fontes, animações, espaçamentos, raios, alvos de toque e tema |
| `lib/ui/metro_layout.dart` | Larguras de conteúdo, colunas adaptativas e ação principal fixa |
| `lib/ui/metro_widgets.dart` | Avisos, estados vazios e de falha, linhas, painéis e campos com rótulo |

São usados componentes Flutter e ChangeNotifier. Sem infraestrutura adicional de estado ou um segundo motor técnico em Dart.

## Layout

Cores, fontes e tamanhos vêm do tema; as telas não repetem valores. Botão principal com 56 pt, secundário com 52 pt e mínimo de 48 pt. Rótulos ficam acima dos campos, para quebrar linha com texto ampliado.

- As seções do furo ficam na base no telefone e passam a um trilho lateral a partir de 600 pt de largura, o que inclui telefone em paisagem.
- A ação principal fica fixa ao alcance do polegar. Em janela baixa (teclado aberto, paisagem, texto ampliado), passa ao fim da rolagem.
- Colunas dependem da largura e do tamanho do texto: os três avanços ficam lado a lado no tablet e voltam a uma coluna a 200%.
- O texto do sistema é limitado a 200%. Rótulos da navegação param em 130% e encolhem para caber, como nas barras do sistema.
- Formulários não usam lista preguiçosa: `Form` só valida campos montados.

A aparência segue o web. Títulos usam Fraunces 600 e texto e controles IBM Plex Sans, embutidas em `assets/fonts` (instâncias estáticas do Google Fonts, SIL OFL 1.1). O login usa a marca do web, convertida de SVG para PNG em `assets/brand`.

As cores vêm dos tokens de `apps/web/src/styles/theme.css` e `brand.css`, em `MetroPalette` (`lib/ui/metro_theme.dart`), com tema claro e escuro conforme o aparelho. No claro, texto secundário, borda de campo e aviso positivo ficam mais escuros que no web, para manter 4,5:1 (3:1 na borda) sob sol, e o texto de erro escurece até 7:1 sobre o fundo de erro; no escuro, texto e ícones da marca usam o lilás claro do web. As telas leem as cores por `context.metro`, nunca por valores fixos.

As animações têm o ritmo do web (`MetroMotion`): troca de cor em 150 ms, recolhimento em 200 ms, entrada em 300 ms com a curva `cubic-bezier(0.16, 1, 0.3, 1)` e saída em 200 ms. Telas entram deslizando com fade, avisos surgem com fade e leve subida, e o estado de sincronização troca com transição. O toque muda a cor, sem ondulação. Com redução de movimento ativada no sistema, nada é animado.

## Persistência e sincronização

O primeiro acesso e o primeiro download são online. O cache é identificado por empresa e usuário. Senha e access token não são persistidos; refresh token e perfil ficam no armazenamento seguro do sistema. O período offline é de até sete dias contados do login, sem extensão automática por renovação. A API continua verificando autorização ao reconectar; uma revogação offline só pode ser conhecida quando houver comunicação.

Cada salvamento confirmado grava documento e operação na mesma transação SQLite. Os textos de um metro ainda não confirmado também são guardados como rascunho. A fila mantém UUID, conteúdo preparado, versão de origem e ordem. Uma operação preparada não é alterada ao repetir o envio.

A API registra o recibo de uma operação junto com a alteração na mesma transação PostgreSQL. Se uma resposta se perder, o aplicativo consulta o recibo antes de reenviar. Operações repetidas com conteúdo diferente são recusadas. A versão atual é conferida no cliente e novamente sob o bloqueio do furo no servidor.

Uma recusa definitiva da API (400 ou 422) não trava a fila: a operação fica marcada como recusada, o motivo aparece na seção correspondente e as demais seguem. Salvar de novo o mesmo item substitui a recusa na mesma transação; fotografia recusada, ou cujo arquivo sumiu, pode ser removida. Um envio para análise recusado sai da fila, e com um envio pendente o furo não aceita edição. Rascunhos de metro sobrevivem ao download e podem ser descartados no editor. O caminho das fotografias é gravado relativo à pasta do aplicativo, porque a absoluta muda em atualizações do iOS. Ao abrir um furo baixado, sem pendências e online, o aplicativo atualiza a cópia em segundo plano.

A sessão só termina com 401 ou sessão salva ilegível. 403 é erro local com a mensagem da API. 5xx e 429, na renovação da sessão ou na leitura da lista de obras e do catálogo da obra, usam a cópia salva no aparelho, desde que o período offline não tenha terminado; 401, 403 e 404 nunca abrem a cópia salva. A classificação fica em `allowsOfflineRead`, em `lib/core/api_client.dart`. Build de release sem `API_BASE_URL` em HTTPS abre uma tela explicando a configuração.

Uma alteração feita no web interrompe a sincronização e preserva o conteúdo local. O botão **Compartilhar cópia de campo** exporta JSON e fotografias locais para conferência assistida, sem tokens ou senhas; não aprova dados nem importa alterações automaticamente. Não há opção de forçar uma sobrescrita sobre o trabalho do engenheiro. Ao sair com pendências, o aplicativo avisa que os registros continuam vinculados à mesma conta no aparelho.

## API

| Rota | Uso |
|---|---|
| `GET /api/v1/mobile/obras` | Obras atribuídas, paginadas |
| `GET /api/v1/mobile/obras/:workId/pastas` | Pastas da obra atribuída |
| `GET /api/v1/mobile/obras/:workId/furos` | Furos da obra atribuída |
| `GET /api/v1/obras/:workId/furos/:boreholeId/mobile/snapshot` | Conteúdo consistente do furo |
| `POST .../mobile/operacoes` | Operação METRE, FIELDS, COORDINATE ou SUBMIT |
| `GET .../mobile/operacoes/:operationId` | Confirmação de operação após interrupção |
| `POST .../mobile/fotografias` | Fotografia com identificador idempotente |

Todas as rotas mobile exigem OPERATOR e atribuição ativa, inclusive para perfis que acumulam outras responsabilidades. As rotas existentes do web mantêm seu comportamento. As migrações `202611040001_field_assignments` e `202611040002_mobile_sync` foram ativadas apenas em `spt_test` nesta entrega. Ativar a segunda também é necessário antes de usar sincronização em outro banco. Recibos são imutáveis e não devem ser removidos enquanto aparelhos puderem repetir operações antigas.

## Executar e testar

```sh
flutter pub get
flutter analyze
flutter test test
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:4000/api/v1
```

Para salvar as capturas da matriz de telas, com fontes reais:

```sh
flutter test test/responsive_screens_test.dart test/responsive_forms_test.dart --update-goldens --dart-define=CAPTURE_DIR=/caminho/absoluto
```

Build nativo para iOS deve ser feito em cópia fora de `Documents`, onde atributos estendidos impedem a assinatura.

No Android Emulator, usar `http://10.0.2.2:4000/api/v1`. A API local principal usa a porta 3000; a de testes usa 4000. As portas web 3001 e 4001 são independentes. Em aparelho físico, configurar o endereço alcançável do computador. Builds de release exigem HTTPS; HTTP no Android está restrito ao debug.

O identificador do aplicativo é provisório e precisa ser definido antes da distribuição. O iOS exige versão 15 ou posterior e o Android, SDK 24 ou posterior. A configuração de assinatura em `ios/Runner/Simulator.entitlements` é exclusiva do simulador em debug. Provisionamento de aparelhos e publicação permanecem fora desta entrega.

Testes Flutter usam SQLite real para reinício, isolamento, fila, conflitos e resposta perdida. Os testes HTTP em `tests/integration/mobile-sync.test.ts` criam e removem seus próprios dados em banco `_test`; validam idempotência concorrente, versão, autorização, penetração parcial, fotos e envio. O roteiro `integration_test/field_flow_test.dart` exercita a interface com uma obra sintética específica; não deve apontar para uma empresa real. Credenciais locais ficam somente em `work/mobile-simulator/access.json`, ignorado pelo Git. A compilação normal do aplicativo não incorpora essas credenciais.

## Verificação e limites de liberação

Análise Flutter sem problemas, 246 testes Flutter aprovados e dois testes HTTP de atribuição/sincronização aprovados. O teste nativo passou nos simuladores iPhone 18 Pro (`field_flow_test.dart` e `photo_delivery_test.dart`) e iPad mini (`field_flow_test.dart`), ambos com iOS 27.0; o detalhe por situação está em `docs/mobile-flutter-mvp.md`.

O simulador permite conferir navegação, formulários e galeria. A câmera física, falta de armazenamento, suspensão do aplicativo durante captura, modo avião prolongado e comportamento em aparelhos Android e iPhone ainda exigem homologação em dispositivos reais. O Android instalado possui licenças de SDK pendentes; elas não foram aceitas automaticamente. O aplicativo está em validação local e ainda não foi distribuído para trabalho de campo.

Referências: [SQLite no Flutter](https://docs.flutter.dev/cookbook/persistence/sqlite), [captura de imagens e recuperação Android](https://pub.dev/packages/image_picker), [armazenamento seguro](https://pub.dev/packages/flutter_secure_storage).
