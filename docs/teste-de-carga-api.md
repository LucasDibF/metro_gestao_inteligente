# Agente de teste de carga da API

Agente do projeto: `api_load_tester`, em `.codex/agents/api_load_tester.toml`. Segue o formato de agente personalizado da [documentação oficial](https://learn.chatgpt.com/docs/agent-configuration/subagents). Herda modelo, ferramentas e permissões da sessão; não muda os agentes existentes. A leitura da configuração pelo cliente depende do projeto aberto e do carregamento da sessão. A existência do TOML não comprova que o cliente já o carregou.

## Objetivo

Medir capacidade por cenário e infraestrutura, preservando integridade, permissões e isolamento entre empresas. Ter milhares de obras armazenadas é diferente de ter dezenas de usuários escrevendo no mesmo segundo. Não há capacidade de produção estabelecida hoje.

O teste anterior de uma obra com 15 furos verificou fluxo e volume de um relatório. Ele não mediu concorrência. A emissão teve cerca de 12 segundos, e a automação recebeu HTTP 429 durante o cadastro. Isso é evidência de proteção contra excesso de requisições, não de saturação computacional. Os números anteriores não substituem uma campanha com configuração registrada.

## Como solicitar

> Use o agente api_load_tester para preparar e executar um smoke local isolado da API Metro. Crie empresas e usuários sintéticos, use banco e bucket exclusivos, mantenha o limitador e entregue métricas por rota e validação dos dados. Não use o banco da aplicação nem publique mudanças.

Depois do smoke:

> Use o agente api_load_tester para executar a campanha gradual aprovada no ambiente isolado. Compare leitura, gravação por metro, fotos e filas de PDF. Pare ao atingir os critérios documentados e apresente o maior patamar sustentável observado, sem extrapolar para produção.

O agente é uma configuração de trabalho reutilizável, não um serviço permanente, um monitor já ligado ou uma ferramenta de carga implementada. Ainda será necessário construir/validar o harness e preparar os dados no ambiente isolado. Esta entrega não executa estresse nem cria recursos remotos.

## Preparação obrigatória

1. Conferir as rotas e contratos atuais, disponibilidade de ferramenta de carga e recursos livres. Preferir ferramenta especializada já instalada; justificar nova dependência e fixar versão caso necessária.
2. Usar API/worker em portas dedicadas, contêiner/cluster PostgreSQL exclusivo com banco `spt_loadtest` e armazenamento dedicado com bucket `metro-loadtest-private`. Outro banco no mesmo cluster não isola papéis PostgreSQL; os scripts existentes alteram senhas de `spt_runtime` e `spt_worker`. Não executá-los no servidor da aplicação para este teste. Arquivo `.env.loadtest` privado, sem alterar `.env` ou `.env.test`. Iniciar serviços somente após validar destinos e permissões. Recusar banco remoto por padrão.
Para medir capacidade, executar API e worker compilados, sem watchers, `DEV_AUTH_BYPASS=false` e configuração equivalente à produção. Execuções com `dev:api`/`dev:worker` são apenas diagnóstico de desenvolvimento.

3. Criar manifesto `run_id` com empresas, usuários, obras, furos, chaves e emissões sintéticos. Começar com 3 empresas e no mínimo um usuário de cada papel por empresa. Ampliar o conjunto de dados por campanha, sem carga indiscriminada.
4. Registrar commit, diffs, versões, CPU/RAM, limites, pools, réplicas, armazenamento, política de rate limit e tamanho do conjunto. Separar o gerador da API quando possível e medir ambos.
5. Desativar consultas externas somente na configuração isolada. Fotos e mapas de teste não precisam consumir serviços públicos. Guardar resultados sanitizados em `load-test-results/<run_id>/`, ignorados pelo Git.
6. Definir duração, VUs, taxa de chegada e teto de dados antes de executar. Sempre oferecer modo de validação sem tráfego e smoke; não começar por um teste de ruptura.

## Cenários

| Campanha | Carga e verificação |
|---|---|
| Baseline | 1 usuário, 30 s de aquecimento e 60 s de observação; rotas de negócio, não somente health |
| Uso normal | Etapas candidatas de 1, 5, 10, 25 e 50 usuários; 30 s de aquecimento e 120 s medidos por etapa; ampliar somente se as anteriores passarem |
| Chegada controlada | Taxas iniciais baixas, escaladas após baseline; medir taxa oferecida/concluída, tarefas não iniciadas e atraso de agendamento |
| Leitura | 60% das jornadas iniciais: resumo, obras/pastas/furos paginados e análise; validar conteúdo retornado |
| Escrita | 30% das jornadas iniciais: identificação e solo/SPT por metro; furos distintos por usuário, versões corretas e tempos de interação |
| Arquivos/relatórios | 10% das jornadas iniciais; medir envio e processamento separadamente. Essas proporções são hipóteses a revisar com uso real |
| Fotos | Arquivos distintos e escalas de 0,5/2/6 MiB e próximos de 8 MiB, respeitando 25 MP; incluir dimensão, formato e complexidade |
| PDF | Relatórios de 1/5/15 furos; começar com 1 emissão, depois 2 e 5 concorrentes se os critérios permitirem; medir fila, processamento e download |
| Conflito | Dois usuários no mesmo registro, separado da carga normal; confirmar conflito visível, sem sobreposição silenciosa |
| Autenticação | Login, MFA e renovação em campanha própria; não autenticar em cada chamada de negócio |
| Resistência | 15–30 min no patamar aprovado, após campanhas curtas; avaliar crescimento de memória, conexões e fila |
| Estoque de dados | Comparar bases progressivamente maiores mantendo a mesma carga; medir paginação e consultas, sem confundir com número de usuários |

As etapas são um plano inicial, não comandos prontos nem autorização para consumir recursos externos. Fotos, PDFs e gravações têm limites próprios e não devem ser multiplicados por todos os usuários sem teto de recursos.

## Métricas e critérios iniciais

- Por etapa/rota: amostras, latência p50/p95/p99 de sucesso, RPS oferecido e concluído, 4xx por causa, 5xx, 429, timeouts, retentativas e latência total da jornada.
- Negócio: gravações persistidas, conflitos esperados, versões, isolamento entre empresas, fotos prontas, filas e PDFs íntegros.
- Recursos: API, worker e gerador; CPU/RAM, banco/conexões/locks, armazenamento e rede. Não somar RSS e tratá-lo como memória exclusiva sem ressalva.
- Hipótese inicial de aceitação: p95 de leituras abaixo de 500 ms e de escritas abaixo de 1 s; 5xx/timeouts abaixo de 1%; zero corrupção ou acesso entre empresas. Valores propostos, não SLA contratado.
- Para arquivos/PDF, definir metas depois do baseline, condicionadas ao tamanho, páginas e concorrência. Um `POST` de emissão rápido não equivale a PDF pronto.
- Pausar imediatamente em vazamento entre empresas, corrupção ou falta de espaço. Pausar escalada se 5xx/timeouts excederem 1% ou p95 de chamadas comuns ultrapassar 2 s por duas janelas de 30 s com no mínimo 20 amostras válidas por janela. Em amostras menores, reportar insuficiência e avaliar falhas individualmente, sem declarar aprovação estatística.
- Se 429 superar 5% por duas janelas de 30 s, interromper a escalada e reportar limitação por política. Respeitar Retry-After e medir espera. Não tirar conclusões de capacidade a partir de respostas 429 rápidas.
- Repetir patamares próximos do limite antes de apontar capacidade. Registrar distribuição, variabilidade e tamanho da amostra; p99 de amostra pequena não deve sustentar promessa comercial.

## Atenção específica ao Metro

O limitador atual parte de 120 requisições/minuto e autenticação tem limites próprios; verificar a implementação ao executar. Vários usuários locais podem compartilhar IP e chave de limitação. Isso também exige análise de confiança no proxy na futura hospedagem. Não forjar IP ou desativar a proteção para produzir resultado favorável.

O worker usa filas PostgreSQL, fotos com sharp e PDFs com Chromium. Não adicionar Redis por pressuposto. Verificar planos de consulta, transações e pool antes de recomendar réplicas. A carga deve validar RLS com conexões restritas; o proprietário usado na preparação não participa do tráfego medido.

Limites atuais a confirmar no código: 20 furos e 40 imagens por composição, foto até 8 MiB/25 MP e leitura de objeto de até 20 MiB por padrão. Conferir relatórios próximos do limite de leitura e a integridade do download. Medir o tempo em fila separado do tempo do worker.

## Entrega esperada

Resumo executivo, configuração e comandos de reprodução; dados brutos sem segredos; tabela por patamar com carga oferecida/efetiva, percentis, erros e recursos; validação de integridade; patamar máximo aprovado e primeiro reprovado, se observado; gargalos comprovados; testes não feitos e próximo experimento. Registrar limpeza dos próprios dados ou preservação do ambiente para inspeção.

Formato da conclusão: “No ambiente X, cenário Y e duração Z, o maior patamar aprovado foi N usuários/RPS com os critérios K”. Se o teste parar no limitador, declarar capacidade computacional não determinada. Não converter usuários virtuais em clientes simultâneos sem modelo de uso.
