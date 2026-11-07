# E07 — Relatórios, snapshots e emissão de homologação

Implementação local observada em 31/10/2026. Já existe geração real de PDF por worker e armazenamento privado, mas o modelo é explicitamente inicial para homologação: a referência MODELO - SANEAGO.xlsm foi recuperada e a correção parcial está documentada em report-reference.md, não declara conformidade normativa completa e não contém assinatura digital ICP-Brasil.

## Composição e contrato

Prefixo autenticado `/api/v1/obras/:workId/relatorios`.

| Método e rota                    | Perfil e resultado                                                        |
| -------------------------------- | ------------------------------------------------------------------------- |
| GET                              | perfis ativos; até 100 relatórios da obra                                 |
| GET `/opcoes?page=1`             | furos da obra e suas fotos ativas; 20 furos por página                    |
| POST                             | ADMIN/ENGINEER criam composição                                           |
| PUT `/:id`                       | ADMIN/ENGINEER alteram com `version` esperada                             |
| GET `/:id/croqui`                | perfis ativos; `version`, `map`, `svg`, `satelliteAvailable` e `mapError` quando aplicável |
| PUT `/:id/croqui`                | ADMIN/ENGINEER; `version`, `view` ou null para automático, `baseMap` opcional (streets/satellite)                 |
| GET `/:id/emissoes`              | composição, seleção atual e até 100 emissões recentes                     |
| POST `/:id/emissoes`             | somente ENGINEER; `version`, `idempotencyKey` UUID                        |
| GET `/:id/emissoes/:issueId/pdf` | perfis ativos autorizados; somente emissão READY, integridade verificada  |

Composição: `title` até 200 caracteres, `notes` até 4000 (string vazia permitida), `holeIds` ordenados com 1–20 UUIDs distintos, `photoIds` ordenados com até 40 UUIDs distintos e `showOtherBoreholes` booleano. Fotos devem pertencer a furos selecionados e à mesma obra/empresa. Há limite de 100 relatórios por obra, 50 jobs PENDING/PROCESSING por empresa e 1000 registros somados de ensaios/camadas no relatório.

Editar composição incrementa sua versão e remove a referência de emissão vigente, sem alterar o histórico. Solicitar emissão exige todos os furos ativos, aprovação atual (`approvedVersion === technicalVersion`) e coordenada oficial. A composição preserva ordem explícita de furos/fotos.

## Acompanhamento e download na interface

Salvar uma composição abre automaticamente seu histórico de emissões. Somente ENGINEER recebe Gerar PDF de homologação; ADMIN vê a explicação de que pode compor e baixar arquivos existentes, preservando a autorização da API. Apenas nas sessões dedicadas de desenvolvimento, uma ajuda orienta escolher Engenheiro em Perfil de teste na barra superior.

O histórico consulta automaticamente enquanto houver PENDING/PROCESSING: primeira consulta após 1,5 segundo e próximas aproximadamente a cada dois segundos, sem editor aberto. Ao concluir ou falhar, para a consulta automática; erros são apresentados e Atualizar emissões permanece como alternativa manual. PDFs READY podem ser baixados pelo histórico; se houver emissão vigente, Baixar PDF também aparece diretamente na lista. O arquivo continua sujeito à autorização e verificação de hash existentes.

Tipos, build e os seis testes de navegador passaram após essa melhoria (19,6s), incluindo abertura automática e READY sem atualização manual. A verificação na interface local 127.0.0.1:5173 confirmou download direto com nome de arquivo, orientação para ADMIN, botão de geração para ENGINEER e ausência de overflow móvel; capturas pdf-admin-desktop.png e pdf-admin-mobile.png registram o estado. Essa alteração não amplia permissões nem declara homologação do modelo técnico.

## Snapshot e idempotência

A solicitação bloqueia a obra/relatório e cria o registro de emissão/fila na mesma transação que lê os dados. O snapshot JSONB congela empresa/obra, composição, dados técnicos/aprovação, camadas, ensaios/versão do motor, coordenadas oficiais, legendas, recortes, referências/hashes de fotos e pontos do croqui. SHA-256 usa JSON canônico com chaves ordenadas; o worker verifica esse hash.

Idempotência é delimitada por empresa, relatório, usuário e chave. Mesmo pedido (`version`) e chave retorna a operação existente; reutilizar a chave com versão diferente retorna `IDEMPOTENCY_CONFLICT`. A checagem ocorre antes de revalidar a versão corrente, permitindo reencontrar a operação anterior. A interface mantém a chave de uma tentativa enquanto a resposta permanece incerta no mesmo componente; recarga do navegador não persiste essa chave.

Estados implementados: PENDING, PROCESSING, READY e FAILED. Na interface: Na fila, Gerando PDF, PDF disponível e Geração não concluída.

## Worker e confiabilidade

`WORKER_DATABASE_URL` usa o papel dedicado `spt_worker`, sem propriedade de tabelas, superusuário ou BYPASSRLS. O papel não recebe acesso geral às tabelas: executa apenas funções específicas de claim, renovação, falha e publicação de relatórios e claim/finalização/falha de fotos com `search_path` fixado. As funções são restritas e foram retiradas de PUBLIC. O worker verifica seu papel ao iniciar.

Claim usa `FOR UPDATE SKIP LOCKED`, lease de 120 segundos e token novo por tentativa. Heartbeat renova a cada 30 segundos. Jobs expirados podem ser retomados; tentativas são limitadas a três. Falhas transitórias voltam a PENDING com espera `5 × 2^attempts` segundos; falha permanente ou esgotamento fica FAILED. Publicar/falhar exige lease/token ainda válido. O processo consulta a fila a cada dois segundos quando não há trabalho e para após sinal de desligamento.

O worker valida escopo e hash dos originais das fotos, aplica orientação/recorte, reduz imagem para até 1600×1600 e embute JPEG no HTML. Processa fotos em grupos de quatro. Chromium opera sem JavaScript, service workers ou requisições de rede permitidas; HTML faz escape de dados e CSP limita os recursos. Conteúdo PDF tem timeout de 60 segundos e tamanho máximo de 20MiB. Esses limites não são comprovação de sandbox operacional de produção: limites de processo/contêiner e carga ainda precisam ser homologados.

Após gerar, o worker grava em chave de objeto derivada de empresa/obra/job/hash, relê o objeto e compara SHA-256 antes da publicação. O download da API autoriza o recurso e verifica novamente o hash, enviando `X-Content-SHA256`, `no-store` e `nosniff`.

## Vigência e histórico

A publicação pode concluir uma emissão READY sem torná-la vigente. Somente a emissão mais recente da composição atual, com furos ainda aprovados na mesma versão e fotos ainda disponíveis/na mesma versão, pode ocupar `currentIssueId`. Job antigo não substitui uma emissão mais nova. Alterações técnicas/fotográficas invalidam a referência vigente, sem modificar snapshot/PDF histórico.

Triggers protegem identidade, conteúdo e hash do snapshot e impedem reescrita de uma emissão READY. O papel da aplicação não altera diretamente a fila. Isso preserva o histórico no fluxo da aplicação; não representa retenção WORM contra administradores de infraestrutura. Objetos históricos precisam de política externa de retenção/backup antes de produção.

## Conteúdo do PDF atual

Capa com dados de empresa/obra; croqui técnico; seções por furo com data, profundidade executada, água, coordenadas e tabelas de ensaios/descrições por camada; dados declarados do revisor e parecer; fotografias recortadas; rastreabilidade de composição/template/snapshot. Paginação A4 usa cabeçalho/rodapé e numeração. Desde o template 0.3.0, as tabelas genéricas de furo foram substituídas por prancha vertical com camadas, profundidade, curvas iniciais/finais e golpes alinhados. A reprodução integral permanece em aberto; ver report-reference.md.

O croqui usa coordenadas oficiais, norte e barra de escala, selecionados em laranja e referências em cinza; pode incluir outros furos ativos. A prévia e a emissão consultam o fundo selecionado quando habilitado; não imprimem o alerta de GPS da foto. O enquadramento pode ser automático ou ajustado pela API/interface com `view: {centerX, centerY, spanM}`: centro UTM em metros e abrangência, todos números finitos; centros com valor absoluto até 20000000 e abrangência entre 1 e 20000000m. `view: null` restaura automático. Um enquadramento que exclui furo selecionado é rejeitado com `MAP_EXCLUDES_BOREHOLE`. PUT exige versão esperada, incrementa a composição e retira a referência vigente; a vista resultante é congelada no snapshot.

O template 0.2.0 usa escala uniforme nos eixos X/Y, evitando distorção do croqui. O worker verifica a versão do template antes de renderizar e rejeita snapshot de template incompatível, em vez de reinterpretá-lo silenciosamente. Não há mapa-base de terceiros, editor de satélite/ruas ou prova de precisão geodésica.

## Setup, evidências e pendências

Após configurar S3 e o banco, preencha `WORKER_DATABASE_URL` com usuário `spt_worker` e senha exclusiva no banco local e execute `npm run worker:setup:local`. O script é exclusivo de desenvolvimento. Instale Chromium (`npx playwright install --with-deps chromium`), compile e execute `npm run dev:worker` ou o start compilado com ambiente carregado. `PDF_BROWSER_CHANNEL` pode escolher um canal instalado; na ausência dele, o worker usa Chromium do Playwright.

`tests/integration/reports.test.ts` cobre idempotência, snapshot imutável, privacidade/perfis, lease/recuperação, histórico, integridade e job antigo versus vigente. A execução conjunta comunicada teve 12 testes de integração aprovados e gerou três PDFs reais. Não foi reexecutada por esta tarefa documental. Seis testes de navegador passaram no fluxo conjunto, incluindo foto, coordenada oficial, aprovação por ENGINEER, composição e download de PDF; capturas de Relatórios desktop/celular foram inspecionadas. A execução conjunta posterior à fila de fotos passou em 12 testes de integração; a suíte final comunicada passou com 26 testes unitários, 12 de integração e seis de navegador, incluindo prévia/ajuste do enquadramento com versão incrementada e download do PDF.

Para futura homologação técnica/publicação, permanecem: completar os campos e símbolos do modelo Excel/PDF recuperado, casos técnicos especiais, comparação visual de homologação, aprovação do layout final, armazenamento/deploy de produção, provedor/licença cartográfica se forem exigidos satélite/ruas, carga/recuperação operacional e CI remota. A CI versionada agora prepara MinIO e o papel/configuração de worker, mas não possui execução remota comprovada. A fila de imagens compartilha o processo de worker; contratos e limites em E06-arquivos-coordenadas.md.

## Escopo atual local

O usuário adiou publicação para depois dos testes e correções. Esta fase deve exercitar composição, enquadramento, geração e histórico nos serviços locais; não depende de escolher domínio, contratar mapa-base ou executar implantação externa. O aviso de modelo inicial e os limites técnicos continuam válidos.

A verificação final comunicada rejeitou token NULL na publicação e comprovou restrições READY/PROCESSING. Após o ajuste final na composição, o teste dirigido completo passou com dois furos, remoção/reseleção do furo e suas fotos, enquadramento e PDF. Remover um furo da seleção também retira as fotografias pertencentes a ele, preservando uma composição válida.

### Referência visual enviada — template 0.4.0

A imagem de três folhas enviada pelo usuário orienta agora o layout: perfil compacto e curva laranja, fotografias em grade de quatro por furo e croqui ao final, com cabeçalho e responsabilidade repetidos. Remove a capa genérica e a folha exclusiva de rastreabilidade, cujos identificadores passam ao rodapé. Detalhes, diferenças e limitações em report-reference.md. Novas emissões usam 0.4.0; arquivos anteriores permanecem imutáveis.

### Correção 0.5.0: conteúdo e escala do Excel

O perfil mantém 20 m por folha, com NA marcado por profundidade e quadro de leituras no rodapé. Restabelece as colunas e quadros técnicos do Excel na folha A4. A imagem laranja permanece apenas como direção visual. A leitura de água legada é identificada como cadastrada, sem inferir inicial/posterior. Os campos ainda ausentes do cadastro exibem NI. Esta seção substitui a opção de 12 m do template 0.4.0; ver report-reference.md.

### Implementação 0.6.0 com agente PDF Engineering

Correções de origem/fronteiras, textos longos e camadas finas no perfil; paginação explícita de fotos, coordenadas e complementos; validação de área útil e assets no worker. Ver report-reference.md para testes e limites. Nova emissão DEMO foi conferida nas quatro páginas; históricas preservadas. A densidade extrema de rótulos no croqui continua pendente, sem afetar as tabelas completas.


## Refinamento técnico e editorial — 0.6.1 — 01/11/2026

Reutilizado o agente impeccable_finish_reviewer com o kit pdf-engineering. Preservados A4,20 m por perfil, limites das colunas, identidade laranja e conteúdo técnico. Ampliada a tipografia dos valores e descrições; quebra de linhas baseada em largura de glifos, cotas ajustadas à coluna, profundidades com duas casas. A grade não atravessa as descrições; títulos, contraste das curvas e notas foram refinados. Folio global separado da indicação de trecho. Data de campo e emissão identificadas explicitamente.

NA centralizado e contido nos limites0/20/40 m. Observações extensas e descrições que não cabem seguem integralmente para complementos identificados. Rodapé e rastreabilidade agrupados evitam página órfã. Preflight usa margem de segurança de2 mm, espera fontes/imagens e verifica transbordamento e colisões de rótulos.

Resolvida a pendência de rótulos sobrepostos do croqui: posicionamento determinístico com linhas de chamada, sem alterar coordenadas. Quando necessário, referências numéricas remetem à tabela completa; mapas acima de80 pontos podem omitir rótulos auxiliares com aviso explícito. Fotos exportadas até2200 px, JPEG92, sem ampliar originais.

Validação:40 testes unitários,13 de integração,6 de navegador, tipos e formatação aprovados. Doze cenários geraram37 páginas físicas com cabeçalhos/rodapés/folios conferidos e inspeção visual, incluindo limites, camadas finas, textos extensos e40 pontos próximos. Revisão independente dos casos críticos pelo agente, sem bloqueios. Nova emissão real DEMO pelo fluxo API/worker, template0.6.1, emissão10: quatro páginas A4 renderizadas e inspecionadas individualmente, texto selecionável e fontes incorporadas. PDF anterior aprovado preservado por SHA-256. Dados fictícios identificados no documento; nenhum dado de obra real foi modificado.

Permanecem fora desta rodada: prova física de impressão, pinagem completa de fontes/Chromium, política para fila de templates antigos e regressão visual de pixels em CI. A verificação local não equivale a certificação normativa. Campos técnicos ainda não capturados continuam NI.


## Regras de alinhamento e classificação — 0.6.2 — 01/11/2026

Correção dos cinco pontos indicados pelo usuário. Zero deslocado para posição livre da borda do cabeçalho. Rótulos de profundidade e cota usam a mesma referência vertical dos valores SPT ordinários, com espaçamento uniforme de25,5 unidades SVG por metro. Cotas conhecidas passam a constar metro a metro, calculadas como cota da boca menos profundidade; desconhecidas continuam NI. Penetrações especiais mantêm duas linhas legíveis dentro da célula. A posição física das curvas e do NA não foi modificada.

Regra persistente: perfil geológico e classificação só aparecem nos intervalos com avanços registrados; um registro no metro d cobre o intervalo d−1 até d. Origem0 mantém suporte de representação no primeiro intervalo. Camadas são intersectadas com os intervalos ensaiados e a profundidade executada, sem alterar o snapshot original. Não prolongar a classificação até o fim de uma camada cadastrada sem golpes correspondentes. Só mesclar intervalos contíguos com tipo de solo E descrição idênticos; diferenças ou lacunas interrompem a mesclagem. Não inferir classificação a partir do N-SPT.

Validação final:43 unitários e13 integrações aprovados; tipos e formatação aprovados. Quatorze cenários renderizados em40 páginas físicas, incluindo cotas263,35m, metro ausente, classificações iguais/diferentes, origem, limites20/40, camadas finas e penetrações parciais. Todas as páginas passaram conferência de cabeçalho/rodapé/folio; inspeção visual das páginas e revisão independente dos quatro cenários críticos pelo agente existente, sem bloqueios. Emissão real DEMO12, template0.6.2, quatro páginas renderizadas e inspecionadas individualmente. Histórico anterior mantido; sem alteração de dados de obra real. Mantida a grade0–20m e as larguras aprovadas.


### Acabamento solicitado — 0.6.3 — 01/11/2026

Removida a linha horizontal adicional na profundidade executada, mantendo o quadro textual Limite. Texto das classificações centralizado horizontalmente na coluna90–330 (âncora210), com a mesma quebra de linhas, intervalos e conteúdo. Mantidas todas as outras proporções.44 testes unitários e13 de integração passaram. Nova emissão real DEMO13, quatro páginas renderizadas e inspecionadas individualmente, sem cortes ou sobreposições. Arquivos anteriores preservados.


### Pendências de emissão específicas — 01/11/2026

A validação agora distingue REPORT_NOT_APPROVED (aprovação ausente/desatualizada), REPORT_COORDINATES_REQUIRED (referência oficial ausente) e REPORT_HOLE_UNAVAILABLE (seleção indisponível). A interface mostra códigos dos furos afetados. Mantidas as condições técnicas de emissão e as regras que invalidam aprovação ao mudar coordenada; nenhum valor, referência oficial ou aprovação é criado automaticamente. Testes unitários cobrem os três casos; integração de relatório confirma a emissão/imutabilidade.


### Correção de geração com endereço em duas linhas — 0.6.5 — 01/11/2026

Reprodução de emissão FAILED mostrou excesso de altura nas duas folhas de perfil:975,9px contra971,3px de área segura. Endereço em duas linhas e observação de paralisação acrescentavam altura. Margens verticais das notas reduzidas2→1px, preservando conteúdo, fontes,20m, colunas e margem de segurança. Acrescentado cenário sintético com endereço longo e observação à integração de layout. Log do worker agora registra o motivo concreto da falha, antes oculto pelo código genérico.

Testes unitários e integrações de layout/emissão passaram. Nova emissão2 do relatório afetado gerada pelo fluxo API/worker e baixada:4páginas A4 renderizadas e inspecionadas individualmente, com fotos reais, texto selecionável e nenhum corte. Falhas anteriores permanecem no histórico; medições e aprovações não foram alteradas.


### Encerramento parcial — 0.6.6 — 01/11/2026

Atendido o pedido de ocultar0,00, iniciar os rótulos em1m e não desenhar marcações/grade de metros abaixo do encerramento. No último registro com avanços parciais, o término mostrado é o início do respectivo metro mais a soma das penetrações em metros:registro4 com30/6 após3m resulta3,06m;registro7 com30/14 resulta6,14m. O rótulo final ocupa a célula terminal já existente para preservar a legibilidade e o alinhamento com os golpes; a estrutura de20m por folha continua como capacidade máxima. Limite e observações usam a mesma profundidade final. Dados brutos e aprovações não são modificados.

Avanços especiais apresentados numa linha como30/6,sem sufixocm; unidades continuam na legenda. Tipos e descrições de solo preservados, conforme instrução expressa para ignorar a parte de classificações.49 unitários,tipos e2 integrações de layout/emissão passaram. Nova emissão4 real do relatório afetado com4 páginas A4 rasterizadas e inspecionadas individualmente; extração confirma3,06/30/6 e6,14/30/14 sem0,00 ou metros posteriores. Histórico anterior mantido.


## Fundo de ruas — 0.7.0 — 01/11/2026

Adicionado OpenFreeMap/MapLibre, estilo Positron, à prévia autenticada e ao PDF. Pacote isolado @spt/street-map gera raster1200×1040, reprojetado de Web Mercator para a mesma geometria UTM do croqui. Pontos, coordenadas e norte UTM não são deslocados; rótulos e marcadores continuam vetoriais. Créditos OpenFreeMap/OpenMapTiles/OpenStreetMap e URL de licença são incorporados como texto selecionável. Fundo incorporado ao PDF, que abre sem rede depois de pronto. Enquadramento automático passa a mínimo300×1,3m para contexto das ruas; vista manual preservada. Escala gráfica usa passos1/2/5; borda redesenhada sobre o raster.

STREET_MAP_ENABLED=true no ambiente local e exemplo; testes usamfalse para independência da rede. Requer Chromium/Chrome e acessoHTTPS a tiles.openfreemap.org no processo da API e worker. Renderizador não recebe identidade, nomes ou credenciais do usuário; requisições do navegador são restritas ao host do provedor. Timeout8s de carga, cache local em memória de até16 vistas por15min. Falha do serviço preserva croqui e mostra aviso explícito. Nenhuma imagem externa arbitrária é aceita no SVG. Preparação para implantação deve instalar o navegador também na API, que atualmente não o instala no estágioAPI do Docker; publicação segue fora do escopo local.

Verificação: build/tipos e formatação passaram;52unitários,14integrações e6testes de navegador passaram. Teste real de rede gerou fundo em6,66s; prévia autenticada retornou200 com imagem incorporada e extensão390m em1,645s. Nova emissão6 do relatório atual,4páginas A4 rasterizadas e inspecionadas individualmente. Imagem de fundo presente na página do croqui e créditos selecionáveis confirmados por extração. Demais folhas preservadas. Coordenadas fictícias continuam apontando à localização de teste, sem substituição automática por endereço. Ajustes finais de escala/créditos passaram nos testes direcionados de coordenadas/mapa e formatação.


## 0.7.1 — opção de satélite Esri (local)

`composition.mapBase` preserva a escolha entre `streets` e `satellite`, inclusive ao reeditar a composição; `snapshot.map.baseMap` congela essa escolha para a emissão. Ausência do campo mantém compatibilidade com ruas. O worker também aceita snapshots 0.7.0 pendentes, pois o perfil técnico permanece compatível.

A chave `ARCGIS_API_KEY` é lida somente no servidor, em API e worker. GET croqui retorna apenas disponibilidade e erro seguro; nunca a credencial. PUT rejeita fonte desconhecida, respeita papéis/versão e recusa satélite sem chave antes de mutar dados. A emissão também bloqueia falta de chave antes de enfileirar. Prévia retorna `svg: null` e erro recuperável em falha Esri; não substitui a imagem selecionada por ruas silenciosamente. Falhas posteriores no worker seguem o fluxo de tentativas existente e não publicam PDF incompleto.

World Imagery usa tiles autenticados, reprojetados ao mesmo referencial UTM da sobreposição. Créditos são obtidos do endpoint oficial, validados e escapados; ausência de atribuição impede renderização. Os créditos ocupam espaço adicional abaixo da escala, sem deslocar a barra para a região de rótulos. Não há cache persistente Esri. A imagem é incorporada ao PDF, sem acesso de rede do documento final.

Verificação: 55 testes unitários, 16 integrações e seis testes de navegador. Incluem chave ausente, papel sem permissão, persistência após edição da composição, fonte congelada na emissão, credencial redigida em falha do provedor, autenticação dos tiles sintéticos, reprojeção compartilhada e caso de rótulo próximo à escala. Prévia em desktop/celular conferida visualmente. PDF de validação de quatro páginas foi rasterizado e inspecionado, com texto selecionável e créditos completos; fundo explicitamente sintético, sem afirmar cobertura real da Esri. Ativação e homologação com imagens reais dependem de conta/licença/chave Esri. Nenhuma medição, aprovação ou coordenada existente foi alterada.


## 0.7.2 — Google como única integração de mapas

Por solicitação do usuário, as integrações Esri e OpenFreeMap foram removidas. As seções anteriores que descrevem esses provedores são histórico de implementação e não representam a configuração atual. `ARCGIS_API_KEY` e `STREET_MAP_ENABLED` não são mais lidos nem constam dos ambientes. O módulo antigo de rasterização e suas dependências exclusivas foram retirados.

`GOOGLE_MAPS_API_KEY` configura uma chave de navegador restrita à Maps Embed API e aos sites autorizados. GET croqui retorna `google: {embedUrl, externalUrl}` quando há coordenadas; `embedUrl` é null sem chave. A referência usa o centro oficial convertido de UTM para WGS84, sem enviar nomes de empresas ou códigos dos furos. O iframe é servido diretamente pelo Google. Não há fundo raster na prévia técnica ou no PDF. PUT croqui volta a aceitar somente versão e enquadramento, sem escolha de provedor. Registros históricos não são apagados; escolhas antigas de provedor são ignoradas, e removidas da composição apenas quando há novo salvamento do enquadramento.

O snapshot e o PDF não incluem chave, URL ou imagem Google. Norte, escala, pontos e coordenadas permanecem vetoriais e selecionáveis. A geração não depende da chave. O worker aceita snapshots pendentes 0.7.0/0.7.1 compatíveis e gera novos PDFs técnicos sem consultar provedores; PDFs já emitidos permanecem imutáveis. Configure a chave real e confira o mapa na interface antes de considerar homologado o serviço externo. Testes de navegador usam quadro simulado, sem consumir Google. Ativação local descrita no README.


## 0.8.0 — fundo gratuito INPE na prévia e no PDF

Integração autorizada após duas amostras reais: `packages/map-reference/src/inpe.ts`, `inpe-source.ts` e `inpe-geometry.ts` consultam a coleção oficial RGB fusionada de 2 m e conferem sua licença CC BY 4.0. A API retorna a prévia SVG com metadados de estado/cena/data/resolução; o worker incorpora imagem e créditos à emissão. Falha ou falta de cobertura não bloqueia a emissão: o PDF registra o aviso e preserva o croqui vetorial. Nenhum ponto é reposicionado para buscar cobertura.

O enquadramento e a transformação são compartilhados com a prancha600×520. Janelas de leitura são limitadas, apenas por HTTP Range, com host/caminho fixos, sem redirecionamentos; qualquer canal RGB com zero é rejeitado como NoData. São consultadas no máximo seis cenas. Os limites de rede, memória, abrangência, cache e concorrência estão documentados no README. A execução de produção é JavaScript, sem dependência de Python. A imagem não tem garantia de ausência de nuvens ou precisão cadastral. A data/cena no PDF são as efetivamente usadas na geração, não uma promessa de congelamento da prévia anterior.

Testes: 61 unitários, 14 integrações e seis de navegador passaram, além de tipos, build e formatação. A integração inclui emissão privada pelo worker com imagem sintética; o navegador cobre imagem disponível, falta de cobertura e recuperação. Layouts extensos foram testados com imagem e com avisos. O renderizador JavaScript também leu imagem real de Brasília; o relatório completo de demonstração foi rasterizado em quatro páginas e inspecionado, preservando texto selecionável, fonte, data e licença. O código mantém os perfis SPT e as fotografias no padrão aprovado. Imagens reais não são usadas nos testes automatizados dependentes de rede.

## Ordem das folhas — modelo 0.8.15

Novas emissões seguem a composição: capa; perfil e respectivas fotografias de cada furo, na ordem selecionada; croqui ao final. Continuações do perfil e do fotográfico permanecem junto do próprio furo. Furos sem fotografias não criam folha vazia. O modelo 0.8.14 e anteriores conservam a montagem histórica, sem alterar arquivos ou snapshots já emitidos.

Validação: testes de sequência para dois furos, fotografias fora de ordem no snapshot, múltiplas folhas de fotos, perfil com continuação e furo sem foto. PDF fictício de seis páginas renderizado e inspecionado; geometria aprovada preservada.

## Descrição no último metro parcial — modelo 0.8.16

No metro final com penetração parcial (por exemplo, 30/15 e 30/1, parada em 3,16 m), a grade desenha a linha inteira com a profundidade medida, mas a camada era desenhada só com os centímetros reais. Com cerca de 4 px de altura, nenhuma linha cabia e a descrição ia para uma folha de complemento, deixando a linha vazia. A partir do 0.8.16, as camadas desse metro ocupam a linha inteira, na mesma proporção do trecho medido. Quando a descrição não cabe, a fonte diminui de 10 até 6 px. A folha de complemento fica reservada ao texto que não cabe nem com 6 px. A camada desse metro continua sem consistência, porque não há N-SPT.

O modelo 0.8.15 e os anteriores conservam o desenho histórico. Validação: testes de regressão com o caso real (linha 3–4 m preenchida, sem complemento, e o 0.8.15 inalterado) e com descrição longa reduzida ou movida ao complemento; 133 testes unitários, tipos e formatação aprovados. A emissão real foi renderizada nos dois modelos e inspecionada: 0.8.15 com 5 páginas (1 de complemento) e 0.8.16 com 4, sem complemento.

## Campos sem informação em branco — modelo 0.8.17

Até o 0.8.16, o perfil individual imprimia "NI" (não informado) em cada campo sem dado: peso e queda, revestimento, amostrador, início e término, tipologia, km, lote, posição, deslocamento, fiscal, as leituras de nível d’água, trado, lavagem, profundidade do revestimento, lavagem por tempo, a cota sem altitude e as colunas de revestimento e método. A partir do 0.8.17, esses campos ficam em branco: o rótulo continua ("Fiscal:", "Início: · Término:") e a célula fica vazia. Na legenda sai a definição "NI = não informado;". No cabeçalho das folhas e na capa, "Não informado" e "Não informada" também saem: Cliente, Local, Cota (m) e Data de campo (na conferência interativa) mantêm o rótulo com o valor vazio, e o cliente da capa fica vazio. A linha de local da capa, que não tem rótulo, deixa de ser impressa quando não há cidade nem estado (antes: "Local não informado"). Continuam como estavam "NE = não encontrado", "Coordenadas UTM: Não informadas", "Não informado (não equivale a NE)" no nível d’água, "não registrado" no motivo da paralisação, "não confirmados" sobre o equipamento, o "—" de avanço inexistente e o separador "·".

O modelo 0.8.16 e os anteriores conservam o "NI" e o "Não informado". Validação: a saída HTML das 20 versões anteriores (perfis, conferência interativa e relatório completo com capa, com e sem dados de campo e da obra) foi comparada byte a byte antes e depois da mudança, sem diferença; testes novos cobrem o 0.8.17 sem "NI" nem "não informado" no cabeçalho e na capa, com os rótulos, e o 0.8.16 com o texto histórico; testes unitários, tipos e formatação aprovados. Um PDF de exemplo foi renderizado pelo worker no 0.8.17 e inspecionado.
