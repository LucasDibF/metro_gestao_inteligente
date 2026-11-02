# E05 — Revisão técnica e invalidação

Implementação local observada em 31/10/2026. O fluxo registra a responsabilidade declarada por um usuário ENGINEER; não verifica habilitação profissional em cadastro externo e não constitui assinatura digital.

## Estados e versões

Furo começa em `DRAFT` (Em preparação), pode passar a `IN_REVIEW` (Aguardando revisão) e depois `APPROVED` (Aprovado tecnicamente). `technicalVersion` identifica o conteúdo técnico; `approvedVersion` deve coincidir com ela para aprovação vigente. A versão geral de edição do cadastro é separada.

Prefixo autenticado `/api/v1/obras/:workId/furos/:boreholeId/tecnico`.

| Ação                   | Perfil            | Entrada                                                            |
| ---------------------- | ----------------- | ------------------------------------------------------------------ |
| POST `/enviar-revisao` | ADMIN ou ENGINEER | `technicalVersion`, `note`                                         |
| POST `/aprovar`        | somente ENGINEER  | `technicalVersion`, `note`, `reviewerName`, `reviewerRegistration` |
| POST `/devolver`       | somente ENGINEER  | `technicalVersion`, `note`                                         |

Parecer é obrigatório, até 2000 caracteres. Nome e registro declarados têm limites de 200 e 100. Enviar exige DRAFT; aprovar/devolver exige IN_REVIEW. Versão divergente retorna conflito de versão, transição divergente retorna `REVIEW_STATE_CONFLICT`.

O MVP permite que o mesmo ENGINEER prepare e aprove os dados; não há regra de dupla revisão/separação de funções implementada. ADMIN sem perfil ENGINEER não aprova nem solicita emissão.

## Consistência para envio/aprovação

Exige data de campo, profundidade executada, ao menos um ensaio e ao menos uma camada. O perfil de solo deve cobrir de zero à profundidade executada, sem lacunas; ensaios devem possuir avanços e seus intervalos registrados devem caber na profundidade executada. Esses requisitos são validados antes da transição e na mesma transação dos bloqueios da obra/furo.

O fluxo não transforma estado especial/incompleto em N-SPT convencional. A condição automática de revisão não exige que todos os resultados sejam `CONVENTIONAL`; cabe ao ENGINEER interpretar os dados e o parecer. Essa política deve ser homologada tecnicamente antes de uso oficial e não comprova conformidade normativa de casos especiais.

## Invalidação e histórico

Mudanças em SPT, camadas, identificação do furo, profundidade executada, nível d’água, data de campo ou coordenada oficial alteram a versão técnica e retornam o furo a DRAFT, limpando a aprovação anterior. Alterar a coordenada selecionada como oficial também invalida a aprovação. Operações usam bloqueios e triggers para não aprovar uma versão diferente da revisada.

`technical_events` registra ator, ação, versão, data e detalhes. Há eventos de dados de campo, ensaios, camadas, coordenadas e transições. O papel da aplicação não tem UPDATE/DELETE nesse histórico e um trigger bloqueia atualização. Isso é imutabilidade no fluxo da aplicação, não proteção contra um administrador de infraestrutura que altere o banco fora desse papel.

A API de consulta técnica retorna os 50 eventos mais recentes; não há paginação histórica completa ou exportação de auditoria nesta interface. Alterações técnicas também invalidam a referência de emissão vigente, preservando snapshots/PDFs anteriores, conforme [E07](E07-relatorios-emissoes.md).

## Evidências e pendências

`tests/integration/technical.test.ts` e os testes SPT/coordenadas/relatórios exercitam perfis, duas empresas, versões, transições, sobreposição/lacunas, invalidação e proteção de eventos. A execução conjunta comunicada teve 12 testes de integração aprovados. Não foi executada outra suíte por esta tarefa documental.

Permanecem: homologação das regras de revisão e casos técnicos, confirmação do requisito de autoaprovação no produto final, auditoria operacional completa e implantação. Aprovação registrada no sistema e PDF de homologação não são declaração de atendimento de toda norma técnica.
