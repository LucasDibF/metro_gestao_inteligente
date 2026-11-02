# Metro — Gestão Inteligente

Projeto independente de `sondagem`, desenvolvido como monorepo React/TypeScript, API NestJS, PostgreSQL/Prisma, worker separado e motor geotécnico isolado.

## Objetivo atual: testes locais

Por orientação do usuário, o trabalho permanece local para testar o sistema e corrigir erros. Não é necessário publicar agora. Docker/Compose de produção são preparação futura, sem implantação ou contratação de serviço implícitas.

## Estado atual

Acesso por empresa com MFA/perfis/RLS; obras, pastas, furos, versões e lixeira; lançamento SPT e motor convencional isolado; dados de campo e camadas de solo informadas pelo responsável; revisão/aprovação por ENGINEER com invalidação técnica; fotografias privadas e coordenadas UTM; composição e geração real de PDFs por worker com snapshots, hash e histórico.

O caso convencional 4/6/8 em três avanços de 15cm resulta em N-SPT 14. Registros incompletos, interrompidos ou especiais permanecem sem valor definitivo. O tipo e a descrição do solo são manuais; não há classificação automática nem declaração de conformidade normativa completa.

**PDF atual: modelo inicial para homologação.** O Excel/PDF oficial ainda não foi fornecido para comparar o layout; não há assinatura digital ICP-Brasil. O croqui da prévia e das novas emissões usa imagem gratuita INPE/CBERS-4A quando encontra cobertura útil, mantendo os furos, textos e escala vetoriais. Google Maps permanece como consulta opcional na interface. A conferência de GPS é aproximada e não substitui coordenada oficial ou levantamento geodésico.

A verificação da integração INPE passou em 61 testes unitários, 14 de integração e seis de navegador, incluindo fotografias assíncronas, aprovação, composição, prévia/ajuste de croqui e download de PDF. O modelo/template atual é 0.8.0; o worker recusa uma versão de template incompatível no snapshot. A troca de perfil dedicada passou na verificação local: login automático, ENGINEER → VIEWER → ADMIN, ausência de exceções de página e de overflow móvel; a verificação HTTP cobriu os quatro perfis, rejeitou papel inválido com 400 e restaurou o perfil original. Não há publicação solicitada nesta fase.

Plano consolidado, critérios e dependências: [MVP-001](docs/MVP-001.md). Os módulos de arquivos/PDF já existem; os pacotes de contratos/tipos compartilhados continuam reservados. Leia as limitações de [E04](docs/E04-ensaios-dados.md), [E05](docs/E05-revisao.md), [E06](docs/E06-arquivos-coordenadas.md) e [E07](docs/E07-relatorios-emissoes.md).

## Desenvolvimento local

Requisitos: Node 24.15 ou superior, npm, Docker Compose e Chromium/Chrome para a geração de PDFs. Na primeira instalação, copie `.env.example` para `.env`; preserve um `.env` já existente.

Configure `DATABASE_URL` para o papel restrito da API e `MIGRATION_DATABASE_URL` para o papel local de manutenção. Preencha `JWT_SECRET` e `MFA_ENCRYPTION_KEY` com valores privados separados. Cada valor pode ser gerado com:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Configure também `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY` conforme `.env.example`. Compose usa essas credenciais privadas para o MinIO local, portanto elas precisam estar preenchidas antes de subir os serviços. Use valores exclusivos de desenvolvimento, sem copiá-los para o repositório.

Preencha `WORKER_DATABASE_URL` para o mesmo banco local, usando o papel `spt_worker` com uma senha exclusiva; `npm run worker:setup:local` prepara esse papel sem conceder acesso geral às tabelas. O worker não deve usar a conexão administrativa nem a conexão da API.

O segredo MFA deve continuar estável para decifrar as configurações existentes. Nunca versionar `.env` ou usar as credenciais locais em produção. Os contratos e limites estão em [autenticação](docs/authentication.md).

```sh
npm ci
npm run db:generate
docker compose up -d --wait
npm run db:migrate
npm run db:setup:local
npm run storage:setup:local
npm run worker:setup:local
npx playwright install --with-deps chromium
npm run build
npm run dev:api
```

Em outro terminal:

```sh
npm run dev:web
```

Web: http://localhost:5173. API: http://localhost:3000/api/v1. Saúde em `/health/live` e `/health/ready`. O frontend usa o proxy local para a API. Não há credenciais padrão: para criar uma conta de desenvolvimento, configure `LOCAL_USER_EMAIL`, `LOCAL_USER_PASSWORD` e `LOCAL_TENANT_NAME` no ambiente privado e execute `npm run user:create:local`; o comando informa o ID da empresa para o login.

Em um terceiro terminal, inicie `npm run dev:worker` para consumir as filas persistidas no PostgreSQL: processar fotografias e gerar PDFs no bucket privado. Fotos novas ficam indisponíveis para uso/download até o processamento READY. O script de desenvolvimento carrega `.env`. Para executar o build diretamente, carregue o ambiente e inicie `apps/worker/dist/main.js`; `PDF_BROWSER_CHANNEL=chrome` é uma alternativa quando esse canal estiver instalado.

MinIO local: API de objetos em `http://127.0.0.1:59000` e console em `http://127.0.0.1:59001`. `storage:setup:local` cria/reutiliza o bucket e habilita versionamento. Os scripts de storage/worker são locais; IAM, retenção, backup e credenciais de produção exigem configuração própria.

## Verificação

Com o banco/configuração local prontos:

```sh
npm run format:check
npm run typecheck
npm test
npm run test:integration
npm run build
npm run test:browser
npm audit --audit-level=high
```

Integração de arquivos/relatórios exige MinIO e o papel de worker preparados; PDFs também exigem Chromium/Chrome. Os testes não são ignorados automaticamente quando essas dependências faltam.

Antes de rodar as suítes locais pela primeira vez, com PostgreSQL/MinIO disponíveis e o `.env` local configurado, execute `npm run test:setup:local`. O comando prepara o banco separado `spt_test`, `.env.test` privado, permissões restritas e bucket `spt-test-private`, preservando os dados de desenvolvimento. Integração e configuração de navegador preferem esse ambiente de teste; assim, o worker de uso manual continua ligado ao banco de desenvolvimento e não consome jobs das suítes. A concessão CONNECT considera o nome do banco configurado.

Os testes de navegador usam o frontend e a API compilados e exigem `npm run build` antes da execução. Em macOS, a configuração atual utiliza Google Chrome instalado; em outros ambientes, instale o Chromium do Playwright (`npx playwright install --with-deps chromium`). A CI versionada prepara navegador, MinIO, credenciais temporárias locais e papel restrito de worker para as suítes novas. Não houve execução remota comprovada.

Testes de integração/navegador usam as duas conexões de banco, criam seus próprios dados temporários e removem as fixtures. Execute-os em banco local dedicado a desenvolvimento/testes. As verificações usam o papel restrito para comprovar as políticas; a API recusa superusuário, BYPASSRLS ou proprietário das tabelas. O contexto de empresa é transacional, sem aceitar cabeçalhos livres como prova de identidade.

`npm run format` padroniza o código; `npm run format:check` verifica sem alterar. Dependências, builds e capturas são ignorados. Para parar apenas os serviços locais: `docker compose down`.

## Operação local e preparação futura de implantação

Existem `infrastructure/docker/Dockerfile`, configuração Nginx e `compose.production.yaml` para API, worker e web. A API usa papel restrito; o worker usa `spt_worker` e declara limites de 1GiB/1,5CPU no Compose. Bypass é false em produção. As três imagens tiveram build aprovado em uma revisão anterior; o Dockerfile recebeu ajuste de OpenSSL depois, portanto esses resultados não comprovam build da revisão final. A verificação local de restauração passou. Esses resultados não significam implantação executada, TLS/domínio configurado ou recuperação de produção homologada. Use configuração própria de produção com S3 HTTPS e segredos externos; o `.env.example` local não é um ambiente de produção.

A API gera `X-Request-ID` e logs JSON com método, rota, status, duração e empresa, sem registrar corpo/tokens. O filtro de exceções evita despejar erro interno em resposta pública. ADMIN consulta contagens de jobs e a criação mais antiga pendente em `GET /api/v1/operacao/fila`, restrito à própria empresa. Isso é informação operacional inicial, não monitoramento externo/alertas ou métricas de todas as filas homologados.

Para verificar dump e objetos em uma restauração local temporária, existe `npm run backup:verify:local`. A execução local passou com 16 tabelas, duas referências de foto, duas de PDF e seis objetos verificados; banco/bucket temporários e registros sintéticos foram removidos. O comando não é um agendador de backups nem substitui testes de recuperação de produção. Escopo e limitações em [E08 — operação](docs/E08-operacao.md).

## Acesso local de teste e troca de perfil

A configuração versionada deixa `DEV_AUTH_BYPASS=false`. Para testar localmente sem preencher o login e alternar perfis, execute `npm run dev:setup` com o banco local configurado e depois reinicie a API. Para a conta exclusivamente local, `npm run dev:setup` cria/reutiliza `dev-bypass@example.invalid` e sua empresa de testes e configura `DEV_AUTH_USER_ID`, `DEV_AUTH_TENANT_ID` e `DEV_AUTH_TEST_PASSWORD` no `.env` privado. A senha é usada para reconfirmar MFA, sem envio automático ao navegador; contas reais não são alteradas.

Com o bypass ativo, a barra Acesso de teste local mostra o seletor Perfil de teste: Administrador, Engenheiro, Operador e Consulta. A troca usa sessão autenticada e `POST /api/v1/auth/dev-role` com `{role}`; atualiza apenas o vínculo da conta dedicada configurada e recarrega as permissões reais do banco. Não é um seletor meramente visual nem permite editar perfis de usuários reais. ADMIN tem lixeira; ENGINEER pode aprovar/emitir; OPERATOR/VIEWER permanecem em consulta. Para voltar a testar login/MFA normal, desligue o bypass.

O setup já configura `DEV_AUTH_BYPASS=true` e `NODE_ENV=development`; para habilitar manualmente, use esses valores no ambiente local e reinicie API/frontend conforme necessário. A API exige banco local, cliente de loopback e escuta em 127.0.0.1; produção recusa iniciar com a flag ativa. Para desativar, retorne a flag a false e reinicie a API. Os testes automatizados de navegador mantêm o bypass desligado para validar login real. Os endpoints de desenvolvimento retornam 404 quando desativados. `dev-role` também exige cliente de loopback, identidade igual aos IDs de teste do ambiente e uma das quatro funções permitidas. A função SQL `set_local_test_role`, provisionada por `dev:setup`, restringe a alteração ao próprio contexto e à conta `dev-bypass@example.invalid`.

## Demonstração local

Após `npm run dev:setup`, inicie API e worker locais e execute `npm run dev:demo`. A obra **DEMO — fluxo completo (dados fictícios)** oferece duas pastas, dois furos, quatro camadas manuais, seis ensaios SPT, foto sintética, coordenadas oficiais de demonstração, aprovação fictícia e PDF para download. Todos são exemplos sem validade técnica para obra real. O comando usa a API local autenticada, exige modo de desenvolvimento com bypass, restaura o perfil original e, se a obra já existir, preserva seu conteúdo sem recriar. Ele não completa parcialmente uma demonstração existente.

O ambiente local está pronto para testes: API em 127.0.0.1:3000, interface em 127.0.0.1:5173 e worker ativos no registro final. A suíte separada passou em 26 testes unitários, 12 de integração e seis de navegador. Depois do ajuste final de composição, o fluxo SPT completo também passou com dois furos, remoção/reseleção de furo e suas fotos, croqui e PDF. A demonstração foi criada e sua execução idempotente sem sobrescrita foi verificada.

## Documentação

- [MVP-001 — checklist E01–E08 e dependências](docs/MVP-001.md)
- [Autenticação, MFA e sessões](docs/authentication.md)
- [Obras](docs/E03-obras.md), [pastas e furos](docs/E03-pastas-furos.md), [lixeira](docs/E03-lixeira.md)
- [Motor geotécnico](docs/E04-motor.md) e [ensaios/dados de campo](docs/E04-ensaios-dados.md)
- [Revisão e invalidação técnica](docs/E05-revisao.md)
- [Arquivos privados e coordenadas](docs/E06-arquivos-coordenadas.md)
- [Relatórios, snapshots, worker e PDFs de homologação](docs/E07-relatorios-emissoes.md)
- [Operação, implantação e verificação local de restauração](docs/E08-operacao.md)
- [Contexto do produto](apps/web/PRODUCT.md) e [sistema visual observado](apps/web/DESIGN.md)

Registros incrementais preservam evidências históricas; o checklist MVP-001 e o código atual devem ser consultados para o estado consolidado. Não há remoto Git ou CI remota executada neste levantamento, nem destino de publicação confirmado.

## Agentes existentes

Foram inspecionados o `documentation-agent` do workspace anterior e os agentes de interface Impeccable. Os agentes existentes de revisão e documentação visual foram reutilizados; não foram criados especialistas equivalentes. Configurações de arquitetura/backend/segurança/QA citadas na conversa não foram localizadas no levantamento inicial. Essa lacuna não é apresentada como delegação já executada nem como motivo para bloquear implementação independente.


### Consulta opcional no Google Maps

OpenFreeMap e Esri foram retirados do código, das dependências e das configurações de ambiente. A única chave de API de mapas é `GOOGLE_MAPS_API_KEY`, no `.env` da raiz. O INPE não usa chave. Não modifica as demais configurações de autenticação, banco ou armazenamento.

Para habilitar a consulta:

1. No Google Cloud, habilite **Maps Embed API** e obtenha uma chave de navegador.
2. Restrinja a chave à Maps Embed API e aos sites autorizados. No ambiente local, inclua `http://127.0.0.1:5173/*` e `http://localhost:5173/*` conforme o endereço utilizado.
3. Preencha `GOOGLE_MAPS_API_KEY=` no `.env` e reinicie a API. O worker não usa a chave.
4. Em Relatórios → Ver emissões → Croqui técnico, a referência Google é exibida acima do croqui vetorial. Sem chave, aparece a orientação de configuração e o link para abrir a localização no Google Maps permanece disponível.

A chave de navegador aparece na URL do iframe, como previsto pela Maps Embed API; proteja-a por API e sites autorizados. Não use nessa variável uma credencial de servidor com acesso irrestrito. O mapa é servido diretamente pelo Google, sem cópias, screenshots ou cache pelo sistema. Ele é uma referência de localização centrada no enquadramento UTM; os códigos e as marcações de todos os furos permanecem no croqui técnico separado. Mensagens de chave inválida ou restrição são exibidas pelo próprio Google no quadro. Coordenadas fictícias apontam para a localização correspondente.

O PDF preserva furos, coordenadas, norte e escala; pode incluir o fundo INPE descrito abaixo. Não inclui imagens ou URLs do Google. A geração funciona mesmo sem a chave; as imagens Google não são permitidas em documentos gerados conforme a [FAQ oficial](https://developers.google.com/maps/faq#tos_staticmaps). Emissões antigas permanecem imutáveis. A chave real ainda é necessária para homologar a visualização externa; testes usam URL e quadro simulados sem consumir o serviço.

[Configuração do mapa incorporado](https://developers.google.com/maps/documentation/embed/embedding-map).


### Imagem gratuita INPE no croqui

`INPE_MAP_ENABLED=true` no `.env` habilita a busca automática de imagem na prévia e nas novas emissões. Não exige cadastro, assinatura ou chave INPE. Reinicie API e worker após mudar o ambiente. Para desabilitar o fundo e manter apenas vetores, use `false`. O ambiente de testes usa `false`, com respostas sintéticas nos testes específicos, sem consumir o serviço público.

A integração consulta somente a coleção oficial `CB4A-WPM-PCA-FUSED-1`, colorida por fusão, com pixel de 2 metros e licença CC BY 4.0 verificada no catálogo. A localização vem das coordenadas oficiais dos furos e do enquadramento UTM salvo; o endereço da obra não move pontos automaticamente. O módulo consulta até seis cenas, da mais recente para a mais antiga dentro desse conjunto, e só usa um recorte cuja área inteira tenha pixels RGB válidos. A presença da região no catálogo não garante cobertura útil. Não procura outra cidade para preencher lacunas.

A prévia mostra a imagem, a data, a resolução, a cena e os créditos. Quando não há imagem útil nas cenas consultadas, o serviço está indisponível ou a abrangência excede 1.500 m, mostra o motivo e permite tentar novamente; o croqui vetorial permanece utilizável e o PDF inclui aviso explícito. Uma cena válida pode conter nuvens: não há classificação automática de nuvens no recorte. A resolução de 2 m não permite o detalhe de um levantamento cadastral ou de imagens submétricas.

A leitura é feita em JavaScript com GeoTIFF.js e Sharp, sem serviço Python. Apenas recortes por HTTP Range são lidos; respostas que tentam enviar a cena inteira são recusadas. Hosts e caminho da coleção são fixos, sem redirecionamentos. Limites por renderização: 18 s para rede, 32 MiB recebidos, 8 MiB por faixa e 4,5 milhões de pixels de janela nativa. O resultado é reamostrado para 1200×1040 px no mesmo enquadramento UTM da sobreposição vetorial. A aproximação de reprojeção é comparada com a transformação exata em 25 pontos, com tolerância numérica de 2 cm; isso não é uma declaração de precisão geográfica da imagem.

Há cache de até 12 vistas por processo por 15 minutos, deduplicação de consultas simultâneas e limite de duas renderizações em andamento por processo. Falhas de cobertura usam cache por cinco minutos, e de serviço por dez segundos. Cada processo de API/worker tem seu cache; novas emissões podem consultar novamente o catálogo e obter uma cena diferente. O PDF registra a cena/data efetivamente usada e, depois de emitido, permanece imutável no armazenamento privado. O snapshot técnico não congela os bytes de uma imagem vista previamente na interface.

A imagem e os créditos são incorporados ao PDF, que não faz requisições externas para exibi-los. Perfis SPT, fotografias, medidas, revisões e coordenadas cadastradas não foram alterados. Snapshots pendentes 0.7.0–0.7.2 continuam com o croqui vetorial; novas emissões 0.8.0 usam INPE quando habilitado. Serviço público sem garantia de cobertura ou disponibilidade; o download é gratuito, mas processamento, rede e armazenamento do SaaS continuam consumindo recursos.

[Catálogo e licença da coleção](https://data.inpe.br/bdc/stac/v1/collections/CB4A-WPM-PCA-FUSED-1) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).


## Diretório local e nome do projeto

Nome do repositório/projeto: `metro-gestao-inteligente` (minúsculas e hífens).
Diretório local: `Documents/_Projetos/metro-gestao-inteligente`.

Os comandos npm devem ser executados na raiz desse diretório. Os pacotes internos `@spt/*` mantêm a nomenclatura técnica SPT. O Compose local fixa `name: spt-saas` apenas para continuar utilizando os contêineres e volumes já existentes, sem criar um banco vazio ao mudar a pasta. Banco, usuários, segredos e arquivos de ambiente não foram renomeados.

A mudança de diretório não publica, envia ou sincroniza arquivos com o GitHub.
