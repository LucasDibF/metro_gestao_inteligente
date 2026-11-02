# E04 — Ensaios, camadas e dados de campo

Estado observado no código em 31/10/2026. O motor convencional permanece descrito em [E04-motor.md](E04-motor.md). Formulário, API e persistência já existem; casos geotécnicos especiais ainda não receberam validação normativa completa.

## Ensaios por furo

Prefixo autenticado `/api/v1/obras/:workId/furos/:boreholeId/ensaios`.

| Método        | Entrada/resultado                                              |
| ------------- | -------------------------------------------------------------- |
| GET `?page=1` | `items`, `total`, `page`, `pageSize=20`, por profundidade e ID |
| POST          | `depthM`, `advances`, `interruptionReason`; cria registro      |
| PUT `/:id`    | mesmos campos e `version` esperada; edição atômica             |

ADMIN e ENGINEER gravam; todos os perfis ativos da empresa consultam. `depthM` é decimal em string, com até duas casas. `advances` tem até três pares inteiros de `blows` e `penetrationMm`. A interface recebe penetração em centímetros com uma casa e converte para milímetros inteiros. Zero medido é distinto de avanço vazio. O servidor calcula/persiste resultado e versão do motor; não aceita N-SPT fornecido pelo cliente.

Caso convencional: três avanços de 150mm com golpes positivos; soma do segundo e terceiro avanços. Incompleto, interrompido e especial mantêm dados sem N-SPT definitivo. Uma profundidade inicial duplicada recebe conflito; versão desatualizada recebe `RECORD_VERSION_CONFLICT`. Alterar um ensaio incrementa a versão técnica e invalida aprovação do furo na transação.

## Dados de campo e camadas

Prefixo `/api/v1/obras/:workId/furos/:boreholeId/tecnico`.

| Método e rota      | Entrada/resultado                                                |
| ------------------ | ---------------------------------------------------------------- |
| GET                | `hole`, `layers`, até 50 `events` recentes                       |
| PUT                | `technicalVersion`, `executedDepthM`, `waterLevelM`, `fieldDate` |
| POST `/camadas`    | `fromM`, `toM`, `soilType`, `description`                        |
| PUT `/camadas/:id` | mesmos campos e `version` da camada                              |

Dados de campo e camadas podem ser alterados por ADMIN/ENGINEER. A data aceita `YYYY-MM-DD` real. Profundidade executada é positiva e não pode excluir camadas ou profundidades iniciais de ensaios existentes; o intervalo total dos avanços é verificado no envio/aprovação; nível d’água é não negativo e não excede a profundidade executada quando esta estiver informada. Vazio significa não informado; zero de nível d’água significa superfície.

Camadas usam limites decimais em metros: `fromM >= 0`, `toM > fromM`, sem sobreposição e sem exceder a profundidade executada já informada. Tipo de solo tem até 120 caracteres e descrição até 2000, ambos obrigatórios. A descrição é escrita pelo responsável; o software não infere automaticamente solo por N-SPT. Lacunas podem existir durante a preparação, mas bloqueiam envio/aprovação conforme [E05](E05-revisao.md). Não há exclusão de camadas nesta API.

## Interface e evidências

Acesso por furo com contexto de obra/identificação. Dados de campo, camadas e revisão ficam em formulários inline. Erros recebem foco/rolagem para ficarem visíveis; recarga explícita recupera versões atuais e fecha editores. O fluxo SPT mantém campos de avanços alinhados em desktop/celular.

Migrations incrementais de ensaios e revisão preservam as anteriores. Testes existentes em `tests/geotechnical-engine.test.ts`, `tests/integration/spt.test.ts` e `tests/integration/technical.test.ts` cobrem motor, precisão/validação, isolamento, permissões, versões, camadas e invalidação. Evidências comunicadas da última execução conjunta: 12 testes de integração aprovados, incluindo os módulos posteriores; esta documentação não reexecutou a suíte.

## Limites

O cálculo convencional não comprova todos os critérios de execução/paralisação. Penetrações especiais não são extrapoladas. Não há classificação automática de solos, validação externa do registro profissional nem alegação de conformidade normativa completa. Casos especiais e dados reais anonimizados ainda precisam de referência técnica validada.


## Preenchimento conjunto por metro — 01/11/2026

Ensaios SPT agora reúne golpes, penetrações, motivo de interrupção, tipo de solo e descrição no mesmo formulário. Registrar metro sugere a profundidade seguinte à maior existente. Salvar metro conclui a edição; Salvar e próximo metro abre o próximo formulário sem repetir automaticamente a classificação. Editar metro carrega os dois conjuntos; profundidade de um registro existente fica fixa para preservar o vínculo. Tipo e descrição são obrigatórios neste fluxo. A lista mostra também as descrições e indica registros antigos sem solo. Dados do furo e revisão mantém acesso aos dados gerais, fotos, coordenadas e aprovação.

Contrato compatível: POST/PUT /obras/:workId/furos/:boreholeId/ensaios aceita soil:{soilType,description} e technicalVersion. O payload antigo sem soil permanece suportado. A leitura retorna technicalVersion, nextDepth e as camadas intersectantes em cada registro. O editor usa a convenção do perfil aprovado: profundidade d corresponde à descrição d−1..d; origem0 mantém0..1. Isso não altera os cálculos nem os dados brutos do ensaio. Os intervalos são exibidos no formulário.

Gravação única na transação existente com bloqueio de obra/furo, versão do ensaio e versão técnica. Validação do solo depois da gravação SPT continua dentro da transação: qualquer falha desfaz tudo. Intervalos sobrepostos são subdivididos por atualização/criação, sem exclusão ou aumento de privilégios; os trechos externos preservam seus textos. Histórico registra os intervalos anteriores. Alterações invalidam aprovação pelas regras existentes. Conflitos não fecham o formulário; a ação de recarga informa que fecha a edição. Nenhum dado existente foi migrado ou reclassificado automaticamente. Camadas fracionadas idênticas continuam preenchendo o editor sem entrada repetida.

Validação: build, tipos, formatação e44 unitários aprovados;14 integrações e6 testes de navegador aprovados. Novo teste comprova rollback de solo/SPT e versão técnica, preservação de trechos0..2/3..5 ao editar2..3, concorrência com um vencedor e recusa de versão antiga. Navegador verifica cadastro conjunto, avanço ao próximo metro, edição, N-SPT convencional/parcial, aprovação e emissão/download de PDF. Conferência visual desktop1440px e celular390px, sem rolagem horizontal. Template de PDF preservado0.6.4.


### Correção do bloqueio da revisão — 01/11/2026

A mensagem genérica TECHNICAL_DATA_INCOMPLETE citava data mesmo quando a data estava salva. Validação agora diferencia FIELD_DATE_REQUIRED, EXECUTED_DEPTH_REQUIRED, SPT_REQUIRED, SOIL_DESCRIPTION_REQUIRED e SPT_READINGS_INCOMPLETE, com profundidades afetadas na resposta e na mensagem da interface. Ensaio incompleto continua exigindo preenchimento ou motivo de interrupção real; estados interrompidos não são convertidos em convencionais.

Corrigida a incompatibilidade entre o novo fluxo por metro/perfil e a verificação antiga que somava a penetração ao número do último metro. Cadastro e revisão comparam o metro do registro com a profundidade executada, sem adicionar novamente as penetrações. N-SPT e dados brutos preservados.46 unitários,14 integrações e6 testes de navegador passaram, além de tipos/build. Conferência somente leitura dos registros recentes confirmou data salva e identificou a pendência exata do último ensaio; nenhuma aprovação ou medição foi modificada automaticamente.
