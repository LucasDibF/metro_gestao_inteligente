# E08 — Operação local e preparação de implantação

Código observado em 31/10/2026. O usuário definiu a fase atual como somente local, para testes e correção de erros; publicação está adiada e não é condição para concluir essas verificações locais. Há artefatos reais de implantação, logs e verificação local de restauração; isso não declara ambiente de produção implantado, homologação normativa ou nível de serviço atendido.

## Execução e papéis

- API: `DATABASE_URL`, papel sem propriedade de tabelas, superusuário ou BYPASSRLS; contexto de empresa transacional.
- Worker: `WORKER_DATABASE_URL`, papel `spt_worker`, executa funções de fila de foto/relatório sem SELECT geral nas tabelas.
- Manutenção/migrations: `MIGRATION_DATABASE_URL`, somente nos comandos administrativos apropriados. Não usar esta conexão no processo HTTP/worker.
- Storage: bucket privado e credenciais restritas; endpoint HTTPS em produção. MinIO do Compose e scripts de provisionamento são exclusivos do desenvolvimento local.

`infrastructure/docker/Dockerfile` tem alvos API, worker e web. O worker instala Chromium e executa como usuário node; o Compose de produção declara 1GiB de memória e 1,5CPU. Nginx serve frontend e encaminha `/api` para a API, com limite de corpo de 9MiB e cabeçalhos de conteúdo/privacidade/CSP. `compose.production.yaml` mantém bypass desligado e web ligado a 127.0.0.1:8080; domínio, HTTPS externo, banco, papéis, storage e segredos devem ser configurados no destino escolhido.

API, worker e web tiveram builds aprovados em uma revisão anterior. Houve ajuste posterior de OpenSSL no Dockerfile; o build da revisão final não está confirmado. Build e execução dessas imagens não equivalem a uma implantação já comprovada. Migrations devem ser aplicadas e validadas separadamente com o papel de manutenção. Não há migração automática privilegiada no startup da API.

## Logs e visão de fila

Cada requisição recebe `X-Request-ID`. O log JSON HTTP inclui ID, método, rota, status, duração e empresa quando autenticada, sem corpo, senha, token ou query string. O filtro global registra tipo de erro interno e ID, retornando erro público genérico para exceções não HTTP. Workers registram início/finalização/falha e dados operacionais de job, sem conteúdo privado do relatório.

`GET /api/v1/operacao/fila` exige ADMIN e retorna contagens por estado da fila de relatórios e `oldestPendingAt`, somente da própria empresa. Não é painel global nem contagem de todos os jobs de imagem. Health checks liveness/readiness existem; readiness atual consulta o banco, não valida storage, navegador, filas ou serviços externos.

Ainda são necessários coleta/retenção dos logs, alertas externos, métricas de serviço e testes de carga apropriados ao ambiente real. Um processo saudável não comprova que consegue emitir PDFs ou recuperar objetos.

## Verificação local de backup/restauração

Com banco e storage locais preparados, o comando disponível é:

```sh
npm run backup:verify:local
```

O script `scripts/verify-local-restore.ts` aceita somente desenvolvimento fora de produção, banco `/spt` e endpoints locais. Usa Docker Compose/pg_dump/pg_restore, conexão administrativa e acesso ao bucket. Cria uma empresa sintética de verificação sem usuários associados e referências sintéticas de foto, miniatura e PDF, para que a verificação exercite arquivos mesmo quando não há dados de usuário.

Em seguida, produz dump PostgreSQL em diretório temporário privado, copia objetos referenciados e registra seus hashes em manifesto, restaura em banco e bucket temporários com nomes únicos e compara hashes/referências de fotos e PDFs restaurados. A saída resume tabelas/referências/objetos, sem imprimir o dump, credenciais ou conteúdo. O script tenta remover banco/bucket temporários, probes e arquivos temporários ao terminar. Não substitui o banco/bucket original por uma restauração.

Isso é uma verificação de cópia/restauração local de dados e objetos, não uma política de backups agendados, arquivo histórico retido ou teste completo da aplicação restaurada com todos os papéis. O bucket original versionado pode reter versões conforme sua política; exclusão de chave não é expurgo físico dessas versões. RPO/RTO, retenção, recuperação de chaves MFA e testes no destino de produção ainda precisam ser definidos.

Reverificação após a migration 021 e os dados DEMO: PASS, com `tables: 16`, `photoReferences: 2`, `pdfReferences: 2`, `objects: 6`. Banco/bucket temporários e os próprios registros de probe foram removidos. A existência de referências sintéticas garante exercício de cópia/restauração mesmo com ausência de dados de cliente; não converte essa verificação em recuperação de produção homologada. Esta tarefa documental inspecionou o script e registrou o resultado da implementação, sem reexecutá-lo.

## CI e verificação de ponta a ponta

A CI versionada prepara PostgreSQL, papel restrito de worker, MinIO local e bucket, Chromium e segredos temporários, antes de tipos, formatação, testes, build e auditoria. Ainda não houve execução remota registrada neste levantamento.

A execução conjunta comunicada anteriormente incluiu 12 testes de integração e seis testes de navegador, com três PDFs reais e o fluxo de fotografia/coordenada/aprovação/composição/download. Depois da fila assíncrona de imagens e ajustes operacionais, tipos, 23 testes unitários e 12 de integração passaram, assim como a verificação local de restauração. A suíte final comunicada passou em 26 testes unitários, 12 de integração e seis de navegador, com fila assíncrona, foco de erro móvel e prévia/enquadramento do croqui. Os três builds passaram em revisão anterior; o ajuste posterior de OpenSSL ainda exige novo build para representar a revisão final. A troca de perfil dedicada passou na verificação local: login automático, ENGINEER → VIEWER → ADMIN, ausência de exceções de página e de overflow móvel; a verificação HTTP cobriu os quatro perfis, rejeitou papel inválido com 400 e restaurou o perfil original.

## Preparação futura para publicação — fora do objetivo local atual

- Destino, domínio, HTTPS, credenciais e ambientes de homologação/produção.
- Build/execução dos artefatos no ambiente escolhido e smoke test de API/storage/worker/PDF.
- Modelo Excel/PDF oficial e homologação técnica dos relatórios/casos especiais.
- Provedor/licença de mapas se o escopo exigir satélite/ruas; o croqui técnico atual não depende disso.
- Retenção/backup/recuperação de banco, objetos e chaves, com RPO/RTO acordados.
- Monitoramento externo, carga, recuperação de leases sob falha e estratégia de rollback/migrations.

O checklist consolidado em [MVP-001](MVP-001.md) mantém esses critérios futuros separados da meta local; arquivos locais, testes sintéticos e PDF de homologação não são aprovação automática de produção.

## Testes e demonstração separados

`npm run test:setup:local` configura banco `spt_test`, `.env.test` e bucket `spt-test-private`, aplica migrations e permissões restritas, com CONNECT dinâmico para o banco configurado. Integração/navegador preferem `.env.test`; o worker de desenvolvimento não recebe os jobs do banco de teste. A preparação local foi executada. A suíte final passou em 26 testes unitários, 12 de integração no banco/bucket isolados e seis de navegador, mantendo o worker manual ativo. O guard de alvo de teste recusa banco de desenvolvimento/remoto e bucket inadequado. As 21 migrations foram aplicadas nos bancos local e de testes.

`npm run dev:demo` exige API/worker locais e acesso dedicado de desenvolvimento. A demonstração fictícia foi criada com duas pastas, dois furos, quatro camadas, seis SPTs, foto sintética, coordenadas oficiais de exemplo, aprovação e PDF disponível. Restaura o perfil anterior; se a obra demonstrativa já existe, não recria nem sobrescreve seu conteúdo. Não é dado de obra real ou homologação técnica.

O guard final de lease rejeitou publicação com token NULL; as restrições de estados READY/PROCESSING foram verificadas. Depois da correção final de composição, o fluxo completo com dois furos passou em teste dirigido, incluindo remoção do furo e suas fotos, reseleção, croqui e PDF. API local, worker e interface ficaram ativos; este estado permite testes manuais, sem afirmar homologação normativa ou produção.
