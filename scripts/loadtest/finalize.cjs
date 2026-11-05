const { fs, path, repo, run, load, save } = require('./common.cjs');
const { createHash } = require('node:crypto');
const { config } = load();
const destination = process.argv.find((v) => v.startsWith('--output='))?.slice(9);
if (!destination || !path.isAbsolute(destination))
  throw Error('Absolute --output directory required');
fs.mkdirSync(destination, { recursive: true });
const read = (name) => JSON.parse(fs.readFileSync(path.join(config.dir, name), 'utf8'));
const result = read('results.json'),
  loadResult = read('api-campaign-results.json');
const raw = fs
  .readFileSync(path.join(config.dir, 'requests.ndjson'), 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const allResources = [...read('resources-load.json'), ...read('resources.json')];
const workerEvents = run('docker', ['logs', 'metro-loadtest-worker'], {
  stdio: ['ignore', 'pipe', 'pipe'],
})
  .split('\n')
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  })
  .filter((e) => e?.event === 'report_job_finished')
  .map(({ jobId, durationMs, browserVersion, attempt, published }) => ({
    jobId,
    durationMs,
    browserVersion,
    attempt,
    published,
  }));
const containers = ['api', 'worker', 'db', 'storage'].map((service) => {
  const item = JSON.parse(run('docker', ['inspect', config.prefix + '-' + service]))[0];
  if (item.Config.Labels['metro.loadtest'] !== config.runId)
    throw Error('Refusing foreign container');
  return {
    name: item.Name.slice(1),
    id: item.Id,
    image: item.Image,
    cpu: item.HostConfig.NanoCpus / 1e9,
    memoryMiB: item.HostConfig.Memory / 2 ** 20,
    oomKilled: item.State.OOMKilled,
    running: item.State.Running,
  };
});
const memoryMiB = (text) => {
  const m = text.match(/^([\d.]+)([KMG]iB)/);
  if (!m) return null;
  return Number(m[1]) * { KiB: 1 / 1024, MiB: 1, GiB: 1024 }[m[2]];
};
const resourceSummary = {};
for (const sample of allResources)
  for (const c of sample.containers || []) {
    const v = (resourceSummary[c.Name] ??= { peakCpuPercent: 0, peakMemoryMiB: 0 });
    v.peakCpuPercent = Math.max(v.peakCpuPercent, parseFloat(c.CPUPerc));
    v.peakMemoryMiB = Math.max(v.peakMemoryMiB, memoryMiB(c.MemUsage) || 0);
  }
const publicConfig = structuredClone(config);
delete publicConfig.source.mainEnvSha256Before;
delete publicConfig.dir;
delete publicConfig.certs;
const mainEnvUnchanged =
  createHash('sha256')
    .update(fs.readFileSync(path.join(repo, '.env')))
    .digest('hex') === config.source.mainEnvSha256Before;
const reproduction = read('operator-reproduction.json'),
  extendedIntegrity = read('extended-integrity.json'),
  arrival = read('arrival.json');
const evidence = {
  runId: config.runId,
  dateLocal: '2026-11-03 America/Sao_Paulo',
  config: publicConfig,
  stages: result.stages,
  arrival,
  artifacts: result.artifacts.map((a) => ({
    ...a,
    worker: workerEvents.find((e) => e.jobId === a.issueId),
  })),
  integrity: read('integrity.json'),
  extendedIntegrity,
  reproduction,
  resourceSummary,
  containers,
  assertions: result.assertions,
  mainEnvUnchanged,
  limitations: result.limitations,
  diagnosis: {
    category: 'FUNCTIONAL_PERMISSION_FAILURE',
    productionCapacity: 'INDETERMINATE',
    firstMixedStageRejected: 5,
    claim:
      'A single operator also fails when hole is in a folder, so 5 VUs is not a capacity limit',
    sqlError: '23514 Folder unavailable',
    function: 'protect_operational_records()',
    triggerPath: 'SPT update -> bump_technical_parent -> boreholes -> folders SELECT FOR UPDATE',
    policy: 'workflow_update on folders excludes OPERATOR from USING',
  },
  harnessNotes: {
    generator: 'Custom Node fetch, not a specialized k6 benchmark',
    smokeCorrection:
      'Initial smoke over-reported OPERATOR writes because edit helpers did not propagate 500; strict assertion was added. Measured stage evidence and one-user reproduction are preserved.',
    interruptedWarmup: read('harness-revision.json'),
    resourceSamplesEverySeconds: 5,
    externalRequests:
      'No AWS, Google, INPE or other external services called by the test; dedicated bridge has no outbound firewall guarantee',
    transitiveDependencies:
      'Top-level runtime versions match; complete transitive tree not independently audited in this campaign',
  },
};
save(path.join(destination, 'resultados.json'), evidence);
save(path.join(destination, 'recursos.json'), allResources);
save(path.join(destination, 'eventos-worker.json'), workerEvents);
fs.writeFileSync(
  path.join(destination, 'requisicoes.ndjson'),
  raw.map((r) => JSON.stringify(r)).join('\n') + '\n',
);
const f = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(2));
const lines = [
  '# Metro — resultado do teste de carga da API',
  '',
  `Execução local identificada por ${config.runId}. Data local: 3 de novembro de 2026 (America/Sao_Paulo).`,
  '',
  '## Conclusão',
  '',
  '**A capacidade máxima de produção continua indeterminada.** A campanha encontrou um defeito funcional de permissão antes de chegar a um limite de processamento: Sondador recebe HTTP 500 ao editar um furo que está dentro de uma pasta. O mesmo caso falha com um único usuário e funciona quando o furo sintético é temporariamente retirado da pasta. Não é correto concluir que o sistema suporta apenas um usuário ou que cinco usuários saturam a API.',
  '',
  'A etapa de um usuário Engenheiro passou. A etapa mista de cinco usuários foi interrompida automaticamente por erros; 10, 25 e 50 usuários não foram executados. Nenhum limite de requisições foi desativado ou contornado.',
  '',
  '## Ambiente efetivamente testado',
  '',
  '- API e worker compilados da versão atual, sem watchers, NODE_ENV=production e DEV_AUTH_BYPASS=false.',
  '- Um contêiner API: 1 vCPU e 1 GiB; um worker: 1 vCPU e 2 GiB; PostgreSQL exclusivo: 1 vCPU/512 MiB; MinIO exclusivo: 1 vCPU/512 MiB.',
  '- Docker Linux ARM64 local. Host macOS com 10 CPUs lógicas e 16 GiB; Docker configurado com aproximadamente 7,75 GiB. Outros serviços locais permaneceram ativos, portanto o hardware inteiro não estava reservado à API.',
  '- Banco spt_loadtest em cluster exclusivo; bucket metro-loadtest-private em instância exclusiva. TLS local com certificado próprio validado por NODE_EXTRA_CA_CERTS. Sem relaxar validação HTTPS.',
  '- Três empresas sintéticas, 50 usuários disponíveis, papéis Engineer/Operator/Commercial; estoque inicial de 51 obras, 65 furos e 275 registros de metro. Cinco usuários foram efetivamente usados na maior etapa mista; preparar 50 usuários não significa tê-los testado simultaneamente.',
  '- Gerador Node fetch no host, com think time de aproximadamente 1,8–2,3 s entre jornadas e coleta de recursos. Não havia k6/autocannon instalado; este harness não substitui uma homologação distribuída em infraestrutura de produção.',
  '- Rede bridge dedicada, sem promessa de bloqueio de saída por firewall. INPE/Google desativados no ambiente isolado; nenhuma chamada a AWS ou serviço de mapas feita pelo teste.',
  '',
  '## Resultados por patamar',
  '',
  '| Etapa | Tempo medido (s) | Requisições | Sucessos | 500 | 429 | p95 sucesso (ms) | RPS sucesso | Resultado |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---|',
];
for (const s of result.stages)
  lines.push(
    `| ${s.label} | ${f(s.measuredSeconds)} | ${s.requests} | ${s.successful} | ${s.serverErrors} | ${s.status429} | ${f(s.p95Ms)} | ${f(s.successfulRps)} | ${s.passed ? 'Passou neste cenário' : 'Interrompida por erro funcional'} |`,
  );
lines.push(
  '',
  'Cada etapa gradual previa 30 s de aquecimento e 120 s medidos; a baseline previa 30 s + 60 s. O patamar de cinco usuários parou após aproximadamente 62,7 s medidos: em duas janelas consecutivas de 30 s houve seis respostas 500 por janela. Foram 12 erros em 169 requisições medidas (7,10%). Não houve 429 nem timeout nas etapas medidas.',
  '',
  'Na etapa de cinco usuários, as leituras tiveram p95 de aproximadamente 28,23 ms; escritas bem-sucedidas, 43,88 ms. As respostas 500 e 429 são contabilizadas separadamente e não melhoram os percentis de sucesso. A baixa latência das requisições que funcionam não anula as falhas do Sondador.',
  '',
  'Amostras por rota são pequenas (algumas com menos de dez respostas): p99 consta no JSON bruto, mas não sustenta promessa estatística ou comercial.',
  '',
  '## Defeito reproduzido',
  '',
  '- Perfil OPERATOR/Sondador; furo em DRAFT, com pasta ativa na mesma empresa e obra.',
  '- PUT de um ensaio e PUT das informações técnicas retornaram HTTP 500. As falhas se concentraram nos dois Sondadores da etapa de cinco usuários.',
  '- PostgreSQL retornou SQLSTATE 23514, mensagem Folder unavailable, em protect_operational_records(). Ao atualizar o furo, o trigger tenta bloquear a pasta com SELECT ... FOR UPDATE. A política workflow_update de folders não inclui OPERATOR no USING; o bloqueio não obtém a linha e a guarda acusa pasta indisponível.',
  '- Confirmação sem concorrência: mesmo usuário/furo, dentro da pasta HTTP 500; temporariamente sem pasta HTTP 200. O vínculo original da pasta foi restaurado em finally.',
  '- Referências de código: prisma/migrations/202610310008_trash/migration.sql e definição vigente em prisma/migrations/202610310009_trash_trigger_guards/migration.sql, protect_operational_records; prisma/migrations/202611020001_workflow_roles/migration.sql, workflow_update de folders. Não foi aplicada correção de aplicação nesta campanha.',
  '',
  'Prioridade: corrigir o caminho de bloqueio/autorizações sem conceder edição de pastas ao Sondador, adicionar regressão com e sem pasta e repetir o smoke antes de aumentar carga. A solução deve preservar RLS e isolamento.',
  '',
  '## Chegada controlada de leituras',
  '',
  `Uma campanha distinta ofereceu 2 requisições/s para listagem de obras por 30 s: ${arrival.successful}/${arrival.requests} respostas válidas, zero falhas/429, zero iterações perdidas, atraso máximo observado de agendamento ${arrival.maxStartLagMs} ms e p95 ${f(arrival.p95Ms)} ms. Esta campanha é curta e apenas de leitura; não valida estabilidade por 120 s nem comprova capacidade de escrita, multiusuário ou produção.`,
  '',
  '## Fotos e PDFs — campanha limitada, separada da carga',
  '',
);
for (const a of result.artifacts)
  if (a.type === 'photo')
    lines.push(
      `- Foto sintética de ${a.inputBytes.toLocaleString('en-US')} bytes: READY em ${a.processingToReadyMs} ms, incluindo envio/espera/polling.`,
    );
lines.push(
  '- Um PNG de ruído inicialmente ultrapassou o limite de tamanho após codificação e recebeu 413, comportamento esperado. O último caso foi ajustado para 7.911.795 bytes, abaixo de 8 MiB, e processou normalmente.',
  '',
  '| Furos | Emissões solicitadas ao mesmo tempo | Solicitação até READY (ms) | Bytes PDF | Worker (ms) |',
  '|---|---:|---:|---:|---:|',
);
for (const a of evidence.artifacts)
  if (a.type === 'pdf')
    lines.push(
      `| ${a.holes} | ${a.concurrentRequested} | ${a.readyMs} | ${a.bytes} | ${a.worker?.durationMs ?? '—'} |`,
    );
lines.push(
  '',
  'As quatro emissões terminaram READY na primeira tentativa, com cabeçalho PDF e hash de download conferidos. As duas emissões de 15 furos foram solicitadas simultaneamente; o worker atual processa a fila de forma sequencial. Os relatórios de 5/15 furos deste ensaio usam poucos metros e não contêm as fotos grandes; não são equivalentes ao relatório anterior de 50 páginas. O relatório de um furo inclui as quatro imagens.',
  '',
  'A coluna até READY inclui fila, processamento e resolução de polling de 1 s. A coluna worker vem do log do processamento. A diferença não é uma medição exata do tempo de fila. Não houve revisão visual dos PDFs nesta campanha de carga, e nenhum PDF de teste é entregue como relatório técnico.',
  '',
  '## Integridade e recursos',
  '',
  `Contadores conferidos: ${extendedIntegrity.successfulSptEdits} edições SPT, ${extendedIntegrity.successfulFieldEdits} edições de informações e ${extendedIntegrity.successfulCommercialCreates} obras criadas pelo Comercial. Permaneceram 275 registros de metro e ${extendedIntegrity.works} obras, exatamente os totais esperados. Foram conferidas as versões de 50 registros SPT e 50 furos; nenhuma divergência. A revisão de um warmup interrompido transportou uma gravação SPT e uma de informações já confirmadas para os contadores, sem repetir as escritas.`,
  '',
  'Acesso a uma obra de outra empresa recebeu 404 nas verificações explícitas. Isso é uma verificação direcionada, não uma auditoria completa de segurança. Checksums do .env principal permaneceram iguais; o coordenador também verificou .env.test inalterado.',
  '',
  '| Contêiner | Maior CPU amostrada (%) | Maior memória amostrada (MiB) |',
  '|---|---:|---:|',
);
for (const [name, r] of Object.entries(resourceSummary))
  lines.push(`| ${name} | ${f(r.peakCpuPercent)} | ${f(r.peakMemoryMiB)} |`);
lines.push(
  '',
  'Amostragem de aproximadamente 5 s via docker stats; picos breves podem não aparecer. São limites locais explícitos, não alocação do host inteiro. Nenhum contêiner indicou OOM na inspeção final. A carga foi interrompida por correção funcional, com CPU baixa: não houve prova de saturação. Gerador e event-loop foram registrados em recursos.json; não foram observados atrasos de agendamento no ensaio aberto que comprometessem suas 60 chegadas.',
  '',
  '## Transparência sobre o harness',
  '',
  'O primeiro smoke verificou leitura autenticada, isolamento e três gravações de Engenheiro. Seus helpers não propagavam as respostas 500 do Sondador; por isso a mensagem inicial de smoke aprovado para três perfis foi ampla demais. O harness foi corrigido para falhar nessas operações antes de escalar em futuras execuções. As respostas reais foram preservadas em requisicoes.ndjson, e a falha foi detectada e interrompeu a campanha mista.',
  '',
  'Uma etapa de aquecimento de um usuário foi interrompida para revisar validações do harness, identificada como interrupted-1-VU-harness-review e excluída das métricas de aprovação. A baseline original foi preservada. Correções também retiraram uma exigência indevida de que a obra do Comercial estivesse sempre na primeira página e separaram limiares de p95 de leitura/escrita.',
  '',
  'Testes do harness: dois checks verificaram percentis e a exclusão de 429/erros dos percentis de sucesso. O coordenador executou oito casos de validação de destinos, incluindo recusa do banco principal e destinos remotos.',
  '',
  '## O que não foi demonstrado',
  '',
  '- Capacidade máxima de usuários, RPS ou clientes em produção, AWS ou outra nuvem.',
  '- Patamares de 10/25/50 usuários, pois houve parada por erro funcional antes deles.',
  '- Estabilidade de 15–30 minutos, crescimento grande do banco, MFA sob carga, múltiplas réplicas, distribuição por IP/proxy ou tráfego externo de mapas.',
  '- Limite sustentado de uploads/PDFs; foram somente quatro fotos e quatro emissões limitadas.',
  '- Compatibilidade integral de dependências transitivas: foram registradas versões diretas e hash do lockfile, sem auditoria independente da árvore transitiva da imagem-base.',
  '',
  '## Reprodução',
  '',
  'Na raiz do projeto, após revisar o destino local e recursos disponíveis:',
  '',
  '```sh',
  'npm run build',
  'node scripts/loadtest/prepare.cjs',
  'node scripts/loadtest/seed.cjs',
  'node --test scripts/loadtest/harness.test.cjs',
  'node scripts/loadtest/runner.cjs',
  '```',
  '',
  'O arquivo .env.loadtest e load-test-results são privados/ignorados pelo Git. prepare recusa ambiente já existente; --resume é somente para concluir uma preparação interrompida após validar seus nomes/labels e destinos. Nesta execução foi usado --load-only após a preparação dos casos de arquivo, e --media-only para completar os PDFs após a parada da carga; isso está registrado nos metadados.',
  '',
  'O smoke estrito corrigido deve interromper a reprodução enquanto o defeito do Sondador permanecer. Não desativar o smoke ou o limitador para obter números maiores. Corrigir o aplicativo exige escopo próprio e nova campanha comparável.',
  '',
  '## Encerramento',
  '',
  'Evidências públicas deste teste: relatório, resultados sanitizados, requisições, recursos e eventos do worker. Nenhum token, senha ou arquivo privado de ambiente foi copiado. O encerramento dos contêineres dedicados é registrado em limpeza.json. Os serviços principais e seus volumes não são removidos. Nenhum commit, push, deploy ou recurso de nuvem foi criado.',
);
fs.writeFileSync(
  path.join(destination, 'Relatorio-de-carga-api-Metro.md'),
  lines.join('\n') + '\n',
);
if (process.argv.includes('--cleanup')) {
  for (const c of containers) {
    const current = JSON.parse(run('docker', ['inspect', c.name]))[0];
    if (current.Config.Labels['metro.loadtest'] !== config.runId || current.Id !== c.id)
      throw Error('Cleanup identity mismatch');
    run('docker', ['stop', c.name]);
    run('docker', ['rm', '-v', c.name]);
  }
  const network = JSON.parse(run('docker', ['network', 'inspect', config.prefix + '-net']))[0];
  if (Object.keys(network.Containers || {}).length)
    throw Error('Dedicated network has unexpected containers');
  run('docker', ['network', 'rm', config.prefix + '-net']);
  const cleanup = {
    runId: config.runId,
    removedOwnContainers: containers.map((c) => c.name),
    removedOnlyOwnAnonymousVolumes: true,
    networkRemoved: true,
    mainEnvUnchanged,
    principalServicesTouched: false,
    at: new Date().toISOString(),
  };
  save(path.join(destination, 'limpeza.json'), cleanup);
  save(path.join(config.dir, 'cleanup.json'), cleanup);
  fs.unlinkSync(path.join(repo, '.env.loadtest'));
  for (const name of ['runtime.env', 'actors-private.json']) {
    const file = path.join(config.dir, name);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  for (const name of ['private.key']) {
    const file = path.join(config.certs, name);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
console.log('Sanitized report exported: ' + destination);
