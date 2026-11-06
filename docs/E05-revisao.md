# E05 — Revisão técnica e invalidação

Implementação local observada em 31/10/2026. O fluxo registra a responsabilidade declarada por um usuário ENGINEER no próprio perfil profissional; não verifica habilitação profissional em cadastro externo e não constitui assinatura digital.

## Estados e versões

Furo começa em `DRAFT` (Em preparação), pode passar a `IN_REVIEW` (Aguardando revisão) e depois `APPROVED` (Aprovado tecnicamente). `technicalVersion` identifica o conteúdo técnico; `approvedVersion` deve coincidir com ela para aprovação vigente. A versão geral de edição do cadastro é separada.

Prefixo autenticado `/api/v1/obras/:workId/furos/:boreholeId/tecnico`.

| Ação                   | Perfil            | Entrada                    |
| ---------------------- | ----------------- | -------------------------- |
| POST `/enviar-revisao` | ADMIN ou ENGINEER | `technicalVersion`, `note` |
| POST `/aprovar`        | somente ENGINEER  | `technicalVersion`, `note` |
| POST `/devolver`       | somente ENGINEER  | `technicalVersion`, `note` |

Parecer é obrigatório, até 2000 caracteres. Enviar exige DRAFT; aprovar/devolver exige IN_REVIEW. Versão divergente retorna conflito de versão, transição divergente retorna `REVIEW_STATE_CONFLICT`. Qualquer outro campo no corpo, inclusive `reviewerName`, `reviewerRegistration` ou `reviewerTitle`, é recusado com 400.

## Responsável técnico vem do perfil profissional

A aprovação não aceita mais nome e registro digitados. Na mesma transação da aprovação, a API lê o perfil profissional do próprio usuário na empresa da sessão e grava uma cópia no furo:

| Coluna do furo         | Origem no perfil                  | Exemplo              |
| ---------------------- | --------------------------------- | -------------------- |
| `reviewerName`         | `fullName`                        | `Ana Souza`          |
| `reviewerRegistration` | `CREA-` + `creaUf` + `creaNumber` | `CREA-SP 5061234567` |
| `reviewerTitle`        | `professionalTitle`               | `Engenheira Civil`   |

Sem perfil, ou com nome, número do CREA, UF ou título vazios, a aprovação falha com 409 `PROFESSIONAL_PROFILE_INCOMPLETE` e `missingFields` (lista com `fullName`, `creaNumber`, `creaUf` e `professionalTitle`, na ordem em que faltam). O furo continua em revisão. O evento `REVIEW_APPROVE` guarda a mesma cópia nos detalhes. Telefone e e-mail do perfil não vão para o furo nem para o relatório.

A cópia é fixa: editar o perfil depois não altera furos já aprovados nem emissões. Enviar para revisão, devolver ao campo e as invalidações do banco limpam as três colunas juntas. O título segue a mesma visibilidade de nome e registro: as listagens de furos só o mostram para quem tem ENGINEER, e o snapshot do app de campo traz os três como `null`.

### Rotas do perfil

Prefixo autenticado `/api/v1/perfil-profissional`, só para quem tem ENGINEER como papel principal ou adicional (outros perfis recebem 403). O dono vem sempre da sessão: `tenantId` e `userId` no corpo são campos desconhecidos (400). No banco, a RLS repete a regra (cada um lê e grava só a própria linha; gravar exige ENGINEER ativo).

| Método | Corpo                                                                                            | Resposta |
| ------ | ------------------------------------------------------------------------------------------------ | -------- |
| GET    | —                                                                                                | 200      |
| PUT    | `fullName`, `creaNumber`, `creaUf`, `professionalTitle`, `phone`, `professionalEmail`, `version` | 200      |

A resposta é sempre o perfil inteiro: os seis campos, `version`, `updatedAt`, `complete` e `missingFields`. Sem perfil salvo, os campos vêm `null` e `version` vem 0. O PUT substitui o perfil inteiro: campo ausente, `null` ou só com espaços fica vazio. Com `version` 0 ele cria o perfil; depois, envia a versão lida. Versão diferente, ou uma segunda criação, retorna 409 `RECORD_VERSION_CONFLICT`.

Regras de cada campo (erro 400 `PROFESSIONAL_PROFILE_INVALID` com `field` indicando o campo):

- `fullName`: até 200 caracteres; espaços repetidos viram um.
- `creaNumber`: só o número, sem a UF. Pontos e espaços são removidos e letras viram maiúsculas; o resultado precisa ter de 3 a 12 dígitos, opcionalmente seguidos de `-` ou `/` e um sufixo de 1 ou 2 letras ou dígitos (`5061234567`, `123456-D`, `506.123.456-d` vira `506123456-D`).
- `creaUf`: uma das 27 siglas, gravada em maiúsculas. Número e UF são obrigatórios juntos.
- `professionalTitle`: até 120 caracteres, por exemplo `Engenheiro Civil`.
- `phone`: opcional, até 30 caracteres, só dígitos, espaço, `+`, `(`, `)`, `-` e `.`, com 10 a 13 dígitos (DDD obrigatório, DDI opcional). Guardado como digitado, com espaços repetidos reduzidos a um.
- `professionalEmail`: opcional, até 254 caracteres, gravado em minúsculas.

Caracteres de controle são recusados em todos os campos.

### Na interface web

O menu mostra **Perfil profissional** junto de Segurança da conta, só para quem tem ENGINEER. A página tem a seção Responsável técnico (nome completo, título profissional, número do CREA e UF do CREA) e a seção Contato (telefone e email, opcionais), que avisa que esses dois não saem no PDF. O selo indica perfil completo ou incompleto, e o perfil incompleto lista o que falta para aprovar. O formulário confere os mesmos formatos da API antes de enviar e mostra cada erro no próprio campo, inclusive o `field` devolvido pela API; o conflito de versão oferece recarregar o perfil. Enquanto há alteração não salva, o menu fica bloqueado como nas outras edições.

Na Revisão técnica de um furo em revisão, os campos de nome e registro deram lugar ao bloco Responsável técnico na aprovação, só leitura, com nome, título e `CREA-UF número` e o botão Editar perfil. Sem perfil completo, Aprovar tecnicamente fica desabilitado, a mensagem diz o que falta e Completar perfil profissional abre a página, que oferece voltar à revisão do mesmo furo. Se a API responder `PROFESSIONAL_PROFILE_INCOMPLETE` (perfil alterado em outra aba), o formulário de aprovação fecha e o bloco volta a mostrar o que falta. Depois de aprovado, o furo mostra a cópia gravada (`Responsável: nome · título · Registro: CREA-UF número`), e não o perfil atual. `tests/browser/professional-profile.spec.ts` cobre esse fluxo, os perfis sem acesso à página e o layout em 390 px.

O MVP permite que o mesmo ENGINEER prepare e aprove os dados; não há regra de dupla revisão/separação de funções implementada. ADMIN sem perfil ENGINEER não aprova nem solicita emissão.

## Consistência para envio/aprovação

Exige data de campo, profundidade executada, ao menos um ensaio e ao menos uma camada. O perfil de solo deve cobrir de zero à profundidade executada, sem lacunas; ensaios devem possuir avanços e seus intervalos registrados devem caber na profundidade executada. Esses requisitos são validados antes da transição e na mesma transação dos bloqueios da obra/furo.

O fluxo não transforma estado especial/incompleto em N-SPT convencional. A condição automática de revisão não exige que todos os resultados sejam `CONVENTIONAL`; cabe ao ENGINEER interpretar os dados e o parecer. Essa política deve ser homologada tecnicamente antes de uso oficial e não comprova conformidade normativa de casos especiais.

## Invalidação e histórico

Mudanças em SPT, camadas, identificação do furo, profundidade executada, nível d’água, data de campo ou coordenada oficial alteram a versão técnica e retornam o furo a DRAFT, limpando a aprovação anterior. Alterar a coordenada selecionada como oficial também invalida a aprovação. Operações usam bloqueios e triggers para não aprovar uma versão diferente da revisada.

`technical_events` registra ator, ação, versão, data e detalhes. Há eventos de dados de campo, ensaios, camadas, coordenadas e transições. O papel da aplicação não tem UPDATE/DELETE nesse histórico e um trigger bloqueia atualização. Isso é imutabilidade no fluxo da aplicação, não proteção contra um administrador de infraestrutura que altere o banco fora desse papel.

A API de consulta técnica retorna os 50 eventos mais recentes; não há paginação histórica completa ou exportação de auditoria nesta interface. Alterações técnicas também invalidam a referência de emissão vigente, preservando snapshots/PDFs anteriores, conforme [E07](E07-relatorios-emissoes.md).

## Evidências e pendências

`tests/integration/professional-profile.test.ts` cobre as rotas do perfil (validação, versão, isolamento entre usuários e empresas, papéis sem ENGINEER) e a aprovação a partir dele. `tests/integration/technical.test.ts` e os testes SPT/coordenadas/relatórios exercitam perfis, duas empresas, versões, transições, sobreposição/lacunas, invalidação e proteção de eventos. A execução conjunta comunicada teve 12 testes de integração aprovados. Não foi executada outra suíte por esta tarefa documental.

Permanecem: homologação das regras de revisão e casos técnicos, confirmação do requisito de autoaprovação no produto final, auditoria operacional completa e implantação. Aprovação registrada no sistema e PDF de homologação não são declaração de atendimento de toda norma técnica.
