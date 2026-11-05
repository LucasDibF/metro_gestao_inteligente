# Organização e manutenção do Metro

## Estrutura e responsabilidades

O monorepo mantém React/TypeScript na interface, NestJS na API, PostgreSQL/Prisma para persistência e processos de trabalho separados para fotografias e PDFs. Não foram introduzidos serviços, bibliotecas ou migrações nesta refatoração.

- `apps/web/src`: telas por área de negócio, autenticação e componentes compartilhados em `ui`.
- `apps/api/src`: módulos de acesso, obras, execução SPT, revisão técnica, arquivos, relatórios e visão de trabalho. Operações autenticadas passam por `TenantDatabaseService`, com contexto da empresa por transação e RLS no banco.
- `apps/worker/src`: processamento assíncrono de fotos e relatórios. `report-worker.ts` cuida de reserva, renovação, integridade, armazenamento e publicação. `report-renderer.ts` cuida de navegador, preflight, impressão, limites e liberação dos recursos.
- `packages/geotechnical-engine`: regras puras de cálculo e interpretação, sem acesso ao banco ou à interface. Cálculo não representa aprovação técnica.
- `packages/report-templates`: modelos HTML/SVG, geometria de impressão, marca da empresa e compatibilidade histórica. `types.ts` define os dados; `template-version.ts` define as versões reconhecidas e os limites de compatibilidade.
- `packages/map-reference`, `private-storage`, `api-contracts` e `shared-types`: integrações e contratos compartilhados, conservando as fronteiras existentes.

## Mudanças desta refatoração

### Interface

As seções de obras, clientes, acessos, relatórios, segurança e lixeira carregam sob demanda, com estado de carregamento visível. A tela de login continua disponível imediatamente. O JavaScript inicial passou de 390,45 kB para aproximadamente 257 kB antes de compressão (116,91 kB para aproximadamente 82 kB com gzip). Isso mede tamanho de compilação, não latência em produção.

Os callbacks de encerramento de sessão e tratamento de autenticação mantêm referência estável, evitando reiniciar consultas dependentes apenas porque o componente principal renderizou novamente. A mesma tabela de nomes de perfis passa a ser reutilizada.

O preenchimento SPT separa tipos de registros, leitura/validação dos avanços e apresentação do resumo do registro. A interpretação técnica definitiva continua no servidor. Avanços não executados ficam vazios; valores parciais são preservados em milímetros inteiros.

### Estilos

`styles.css` é o ponto de entrada, com nove módulos: base, estrutura da aplicação, componentes, tema, pastas, folha interativa, análise, fluxo do furo e marca. A ordem original foi preservada, inclusive as sobrescritas. Novas regras devem entrar no domínio correspondente, sem recriar tokens ou adicionar correções globais ao final indiscriminadamente.

### API e emissão

A montagem da identidade da empresa está em `reports/report-identity.ts`, usada na prévia e na emissão imutável. A logo é lida e validada uma vez por montagem. O contexto de empresa, bloqueios, controle de versão e políticas de acesso foram preservados.

### Modelos e processamento

As listas repetidas de versões foram substituídas por um registro explícito de compatibilidade. Versões desconhecidas não recebem recursos automaticamente. As 17 versões suportadas foram comparadas com a saída anterior: o HTML permaneceu idêntico para a mesma amostra, sem alterar o número do modelo.

A renderização foi extraída do controle da fila. O navegador e seu temporizador são encerrados no próprio renderizador, inclusive em falhas. Erros definitivos de layout e tamanho continuam sem repetição automática; demais falhas mantêm o tratamento anterior.

## Validação

A compilação de todos os aplicativos e pacotes foi executada antes e depois. A validação inclui testes unitários, integrações com PostgreSQL/armazenamento em ambiente local isolado e fluxos reais no navegador. Os testes cobrem autenticação/MFA, isolamento entre empresas, permissões, concorrência de versões, gravação conjunta de ensaio e solo, encerramento parcial, fotos, fila e integridade dos PDFs.

Um cenário antigo de rollback foi atualizado: intervalos parciais passaram a ser válidos na correção anterior. O teste agora força uma falha de persistência do solo depois da inserção do SPT e confirma que ambos os registros e a versão técnica são revertidos.

## Critérios para continuar evoluindo

Manter alterações por responsabilidade, sem dividir arquivos apenas por tamanho. Extrair componentes quando houver uma responsabilidade clara; preferir funções puras para conversões e validações. Não substituir controle de versão, transações ou RLS por verificações somente na interface. Alterações futuras de modelo exigem compatibilidade explícita e validação do layout.

Os componentes de edição SPT e composição de relatórios ainda concentram parte do estado dos formulários. São candidatos a extrações graduais quando esses fluxos forem alterados, com cobertura de navegador. Esta rodada reorganiza os pontos principais sem alegar que todo arquivo precisa ou recebeu uma reescrita.

Não houve publicação, envio ao GitHub, reset de dados ou alteração de credenciais nesta tarefa.

## Resultado da rodada de 04/11/2026

- Compilação de todos os aplicativos e pacotes: aprovada.
- Verificação de tipos do monorepo: aprovada.
- Testes unitários: 99 aprovados.
- Integrações: 16 aprovadas.
- Navegador: 9 jornadas aprovadas; a jornada de preenchimento e emissão SPT foi repetida após a extração dos componentes e também passou.
- Comparação dos 17 modelos: HTML idêntico à referência anterior.
- Estilos: mesmas regras e ordem da cascata; pacote CSS compilado permaneceu com 51,38 kB.
- JavaScript inicial final: 256,73 kB, ou 81,57 kB com gzip.
