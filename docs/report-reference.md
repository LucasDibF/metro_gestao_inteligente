# Referência do relatório SPT — correção de 31/10/2026

Referência recuperada: `MODELO - SANEAGO.xlsm` do Desktop do usuário, planilha **RELATÓRIO SPT**, área de impressão A1:W40. Conferência complementar visual com `SP - MODELO (AUTOMATICO) LIMPO - DMM.pdf`. Os arquivos originais foram apenas lidos, sem executar macros.

Memória recuperada: `.codex/memories/rollout_summaries/2026-07-06T22-14-51-6MgZ-spt_prompt_conceptual_rules_visual_advance_display.md` e conversa de análise de 06/07/2026. A referência já estava disponível; o template 0.2.0 não a atendia. As descrições anteriores de "modelo inicial" não representam aceite do usuário.

## Implementado no template 0.3.0

Prancha vertical por profundidade com 20 m por folha e cabeçalho repetido: identificação, obra, contratante, local, coordenadas oficiais e cota. Colunas alinhadas para perfil de camadas, descrição, resistência, três avanços, somas iniciais/finais e água. Duas curvas: 30 cm iniciais em azul tracejado e 30 cm finais em vermelho; resultados especiais não são plotados nem convertidos em zero. Linha interrompida diante de resultado ausente/especial ou lacuna superior a 1 m. Escala horizontal 0–50 com indicação de valores superiores. Camadas e água usam a mesma transformação de profundidade dos ensaios.

Avanço normal de 15 cm mostra apenas golpes. Penetração especial mostra golpes/centímetros reais. Descrição longa tem continuação textual, sem descartar o conteúdo. Nível zero é leitura válida; ausência de informação não é NE. Hachura é esquemática e explicitamente não representa mineralogia.

Emissões anteriores permanecem imutáveis. Nova apresentação aplica-se somente a novas emissões. A versão do template acompanha o snapshot.

## Lacunas que continuam abertas

Não declarar reprodução integral nem conformidade normativa concluída. O cadastro ainda precisa comportar início/término com horário, duas leituras de água com momento/data/hora e estado NE explícito, métodos por intervalo, profundidade do revestimento, equipamento observado, lavagem por tempo e motivo de paralisação. Hoje esses campos são identificados como não registrados; jamais inferidos de uma profundidade ou do modelo de exemplo.

Ainda falta reproduzir símbolos geológicos específicos/legenda, logotipo autorizado e a organização completa do rodapé SANEAGO. Classificação automática deve ser sugestão revisável e validada; não converter a fórmula do Excel em certificação normativa. Dados fictícios não constituem sondagem real nem assinatura profissional.

Critério para encerrar: confrontar PDF emitido pelo fluxo completo com a referência, incluir casos normais, parciais, interrupção, NE e leitura zero, múltiplas camadas/páginas e revisar legibilidade. A amostra de perfis corrigidos é etapa verificável, não homologação final do relatório.

## Direção visual atual — referência enviada em imagem

Em 31/10/2026 o usuário forneceu a imagem `Foto 1.jpg`, com três folhas GEOPLAN: perfil individual, registro fotográfico e croqui de localização. Esta imagem passa a orientar a apresentação; o Excel e a memória continuam orientando a semântica dos dados.

Template 0.4.0: cabeçalho de empresa, identificação compacta, marcador laranja de folha, tabela de avanços à esquerda e curva N-SPT laranja à direita, hachuras representativas, descrições abaixo, rodapé de responsabilidade. Até 12 m por folha; última folha usa a profundidade executada arredondada para cima, eliminando grade vazia até 20 m. Curva final única conforme a nova referência; somas iniciais e finais permanecem na tabela. Escala horizontal se expande para valores acima de 50. Fotos agrupadas por furo em grade de até quatro imagens por folha, com legenda e coordenadas oficiais do furo explicitamente identificadas. Croqui em folha própria ao final com tabela e legenda. Numeração contínua de todas as folhas.

Nome da empresa vem do cadastro, não do texto ilustrativo GEOPLAN. O símbolo de camadas é genérico, não um logotipo cadastrado. Não copiar assinaturas, ART ou coordenadas do exemplo. Não há imagem aérea nem limite cadastrado do terreno; o croqui continua vetorial e não inventa feições. As lacunas de dados técnicos descritas acima continuam abertas.

Verificação: 30 testes unitários, tipos e integração de imutabilidade/fila/download passaram. Nova emissão real na obra fictícia foi gerada pelo worker e baixada pela API; quatro folhas para dois furos, uma fotografia e croqui. Conferência visual das páginas renderizadas, incluindo rodapé e paginação. Emissões anteriores mantidas.

## Correção obrigatória: o Excel determina o conteúdo técnico — template 0.5.0

O usuário corrigiu explicitamente a redução da escala e a ausência da coluna de água. A imagem laranja orienta apenas a identidade visual. Não substituir a prancha do Excel por uma versão resumida.

Escala vertical fixa de 20 m por folha: 0–20, 20–40 etc., mesmo quando o furo termina antes. As camadas, os ensaios, as duas curvas e o marcador de NA usam a mesma transformação de profundidade. Descrições voltam à coluna central, sem tabela de solo separada consumindo espaço. Colunas: cota, perfil estratigráfico, profundidade, descrição, gráfico, três avanços e duas somas, revestimento, nível d'água e método. Cabeçalho inclui os espaços para equipamento, início/fim e dados complementares. Rodapé inclui limite, paralisação, quadro das leituras de água, legenda, trado/lavagem/revestimento, lavagem por tempo e responsabilidade, na mesma folha A4.

O valor de água existente no banco não contém informação sobre momento da leitura; aparece como leitura cadastrada e marcador azul, sem ser falsamente atribuído a inicial ou posterior. Datas/horários, inicial e posterior, método, equipamento, lavagem, revestimento e dados complementares ainda não capturados recebem NI. NI não significa NE. Campos não devem receber os valores de exemplo da planilha como se fossem medições da obra.

Conferência visual com dois cenários: furo executado até 5 m mantendo grade até 20; e 20 ensaios até 20 m com quatro camadas. Ambos mantiveram a prancha com os quadros e o responsável em uma folha. Descrições excepcionalmente extensas têm complemento explícito, sem descarte silencioso. Testes: 31 unitários, tipos e integração de relatórios passaram. Nova emissão pelo fluxo API/worker permanece distinta das anteriores.

### Ajuste de larguras — 0.5.1

Por solicitação do usuário, a coluna de água passou de 88 para 32 unidades, igual à de método. As 56 unidades liberadas foram transferidas integralmente à descrição (184 → 240), deslocando gráfico, ensaios e revestimento sem mudar suas larguras. Marcador de água e título foram adaptados para a coluna estreita. Mantidos 20 m por folha e os quadros técnicos. Cinco testes direcionados do perfil passaram; PDF emitido e conferido visualmente.

### Padrão aprovado e refinamento de traços — 0.5.2

O usuário aprovou a estrutura como PDF padrão SPT e autorizou apenas acabamento dos traços. Manter posições, larguras, tipografia, escala e conteúdo nas próximas revisões de acabamento. Refinados pesos e contraste de grade/contornos, junções/arremates das curvas e renderização geométrica do SVG; bordas de tabelas mantiveram a mesma largura. Nenhum DPI artificial é aplicado ao PDF vetorial.

Verificação do PDF efetivamente emitido: quatro páginas A4 mantidas, 132 palavras únicas com posições preservadas em tolerância de 0,1 pt, zero imagens raster na página do perfil, 636 operações vetoriais e 14 descritores de fontes incorporadas. Inspeção da página e de detalhe renderizado a 600 dpi. Cinco testes direcionados do perfil passaram. O arquivo anterior permanece no histórico.

### Revisão editorial integral — 0.5.3

Pedido explícito de usar a skill de PDF, renderizar todas as páginas antes e depois e refinar a fonte. Inspecionadas as quatro páginas antes de editar. Ajustes: pequeno aumento da tipografia SVG e dos quadros/notas inferiores, marca de 20 m afastada da borda e linha de encerramento fora do rótulo de profundidade, título do relatório consistente, rodapé global em Arial, foto única em largura integral com proporção preservada (grade de múltiplas fotos continua em duas colunas), remoção da moldura duplicada no croqui. Escala, larguras de colunas, margens, conteúdo técnico e numeração mantidos.

Nova emissão pelo fluxo real API/worker. As quatro páginas finais foram renderizadas e inspecionadas individualmente. Comparação de texto integral por página com normalização apenas de espaços, número de emissão e versão de template confirmou preservação do conteúdo; a imagem extraída do PDF tem o mesmo SHA-256 do arquivo anterior. Quatro páginas A4, texto selecionável em todas, zero imagens raster nas folhas de perfil. Cinco testes direcionados e integração de relatórios passaram. Não houve alteração de dados de sondagem.

## Correções implementadas com PDF Engineering — 0.6.0 — 01/11/2026

Autorização explícita do usuário para o agente modificar, não apenas revisar. Reutilizado impeccable_finish_reviewer sob o kit pdf-engineering do chat -4, sem instalação e sem criar equivalente. O agente alterou engineering-profile.ts e seus testes: origem0 incluída, janelas [0,20], (20,40] etc. sem duplicação; tokens longos quebrados por grafemas; camadas finas não recebem descrição fora de seu intervalo; texto integral em complementos explícitos com cabeçalho e rodapé.

Alterações integradas pelo agente principal: seções de fotos e croqui modularizadas em report-sections.ts; fotos com legendas extensas em uma linha de até duas imagens por folha (legendas comuns continuam até quatro); coordenadas do croqui em continuações; observações e responsabilidade extensas em folhas identificadas. Rótulos longos do croqui contidos no SVG. Medidas A4 compartilhadas com o worker; corpo com largura física explícita. Data de emissão formatada em America/Sao_Paulo, sem converter a data de campo pura.

Worker: espera prontidão de fontes e decodificação das imagens; mede todas as folhas na largura de impressão e recusa altura/largura superior à área útil; verifica textos de SVG fora da moldura. Locale/timezone explícitos, preferCSSPageSize e margens derivadas das medidas aprovadas. A verificação evita publicar um PDF conhecido como fragmentado; não é um certificado universal de ausência de colisões. Versão do navegador registrada nos logs. Não foram instaladas fontes nem trocado o canal local Chrome por download automático.

Validação concluída: 34 testes unitários, tipos, Prettier, integração de emissão/imutabilidade e teste de layout no navegador passaram. O teste de layout verifica conteúdo longo, origem, continuações, overflow e imagem inválida. Um teste inicial ficou aguardando addStyleTag com JavaScript desativado; foi corrigido para alteração direta de estilo e passou.

Sete fixtures com PDF real passaram na conferência de páginas físicas, folio global e cabeçalho/rodapé: normal2p; descrição extensa3p; token longo2p; croqui40pontos5p; legendas longas4p; camadas finas3p; origem/fronteiras5p (inclui complemento). Valores84/86/88 de origem/20/40 aparecem uma vez. O revisor inspecionou os cenários críticos rasterizados e confirmou correções. Persistem sobreposições de rótulos quando muitos pontos do croqui estão muito próximos; tabela de coordenadas é completa/legível. Não foi redesenhado esse cenário nesta rodada.

Emissão nova real na obra fictícia DEMO, template0.6.0: quatro páginas rasterizadas e inspecionadas individualmente pelo agente principal. Perfil vetorial e texto selecionável; imagem idêntica à da emissão anterior. Arquivo entregue sondagem-spt-correcoes-agente.pdf. Hash do PDF aprovado anterior permanece aeb68b30dd6c28b9a3436cd640cfb327c070c5ef018e997959a193b6e878c55c. Nenhum dado de sondagem real foi alterado.

Pendências de arquitetura da auditoria não declaradas resolvidas: colisão de rótulos em croqui muito denso; pinagem completa de fontes/Chromium entre ambientes; política de fila para templates antigos pendentes; regressão de pixels automatizada em todas as páginas no CI e prova física de impressão. As verificações locais e os testes existentes foram ampliados, não substituídos.


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


### Encerramento parcial — 0.6.6 — 01/11/2026

Atendido o pedido de ocultar0,00, iniciar os rótulos em1m e não desenhar marcações/grade de metros abaixo do encerramento. No último registro com avanços parciais, o término mostrado é o início do respectivo metro mais a soma das penetrações em metros:registro4 com30/6 após3m resulta3,06m;registro7 com30/14 resulta6,14m. O rótulo final ocupa a célula terminal já existente para preservar a legibilidade e o alinhamento com os golpes; a estrutura de20m por folha continua como capacidade máxima. Limite e observações usam a mesma profundidade final. Dados brutos e aprovações não são modificados.

Avanços especiais apresentados numa linha como30/6,sem sufixocm; unidades continuam na legenda. Tipos e descrições de solo preservados, conforme instrução expressa para ignorar a parte de classificações.49 unitários,tipos e2 integrações de layout/emissão passaram. Nova emissão4 real do relatório afetado com4 páginas A4 rasterizadas e inspecionadas individualmente; extração confirma3,06/30/6 e6,14/30/14 sem0,00 ou metros posteriores. Histórico anterior mantido.


## Fundo de ruas — 0.7.0 — 01/11/2026

Adicionado OpenFreeMap/MapLibre, estilo Positron, à prévia autenticada e ao PDF. Pacote isolado @spt/street-map gera raster1200×1040, reprojetado de Web Mercator para a mesma geometria UTM do croqui. Pontos, coordenadas e norte UTM não são deslocados; rótulos e marcadores continuam vetoriais. Créditos OpenFreeMap/OpenMapTiles/OpenStreetMap e URL de licença são incorporados como texto selecionável. Fundo incorporado ao PDF, que abre sem rede depois de pronto. Enquadramento automático passa a mínimo300×1,3m para contexto das ruas; vista manual preservada. Escala gráfica usa passos1/2/5; borda redesenhada sobre o raster.

STREET_MAP_ENABLED=true no ambiente local e exemplo; testes usamfalse para independência da rede. Requer Chromium/Chrome e acessoHTTPS a tiles.openfreemap.org no processo da API e worker. Renderizador não recebe identidade, nomes ou credenciais do usuário; requisições do navegador são restritas ao host do provedor. Timeout8s de carga, cache local em memória de até16 vistas por15min. Falha do serviço preserva croqui e mostra aviso explícito. Nenhuma imagem externa arbitrária é aceita no SVG. Preparação para implantação deve instalar o navegador também na API, que atualmente não o instala no estágioAPI do Docker; publicação segue fora do escopo local.

Verificação: build/tipos e formatação passaram;52unitários,14integrações e6testes de navegador passaram. Teste real de rede gerou fundo em6,66s; prévia autenticada retornou200 com imagem incorporada e extensão390m em1,645s. Nova emissão6 do relatório atual,4páginas A4 rasterizadas e inspecionadas individualmente. Imagem de fundo presente na página do croqui e créditos selecionáveis confirmados por extração. Demais folhas preservadas. Coordenadas fictícias continuam apontando à localização de teste, sem substituição automática por endereço. Ajustes finais de escala/créditos passaram nos testes direcionados de coordenadas/mapa e formatação.


### Template 0.7.1 — satélite opcional no croqui

Apenas a fonte do croqui recebe a opção Esri. O mapa de ruas continua padrão; perfis SPT e folhas fotográficas permanecem no padrão anterior. A geometria de furos, escala e norte usa o mesmo mapeamento UTM. A atribuição Esri é mantida integralmente em texto vetorial, em espaço adicional abaixo da escala para evitar interseção com rótulos. Layout de quatro páginas rasterizado e inspecionado com fundo sintético. Imagem real, cobertura/resolução e conta/licença Esri ainda dependem de configuração e homologação; não há PDF real de satélite entregue nesta etapa.


## 0.7.2 — Google como única integração de mapas

Por solicitação do usuário, as integrações Esri e OpenFreeMap foram removidas. As seções anteriores que descrevem esses provedores são histórico de implementação e não representam a configuração atual. `ARCGIS_API_KEY` e `STREET_MAP_ENABLED` não são mais lidos nem constam dos ambientes. O módulo antigo de rasterização e suas dependências exclusivas foram retirados.

`GOOGLE_MAPS_API_KEY` configura uma chave de navegador restrita à Maps Embed API e aos sites autorizados. GET croqui retorna `google: {embedUrl, externalUrl}` quando há coordenadas; `embedUrl` é null sem chave. A referência usa o centro oficial convertido de UTM para WGS84, sem enviar nomes de empresas ou códigos dos furos. O iframe é servido diretamente pelo Google. Não há fundo raster na prévia técnica ou no PDF. PUT croqui volta a aceitar somente versão e enquadramento, sem escolha de provedor. Registros históricos não são apagados; escolhas antigas de provedor são ignoradas, e removidas da composição apenas quando há novo salvamento do enquadramento.

O snapshot e o PDF não incluem chave, URL ou imagem Google. Norte, escala, pontos e coordenadas permanecem vetoriais e selecionáveis. A geração não depende da chave. O worker aceita snapshots pendentes 0.7.0/0.7.1 compatíveis e gera novos PDFs técnicos sem consultar provedores; PDFs já emitidos permanecem imutáveis. Configure a chave real e confira o mapa na interface antes de considerar homologado o serviço externo. Testes de navegador usam quadro simulado, sem consumir Google. Ativação local descrita no README.


## 0.8.0 — fundo gratuito INPE na prévia e no PDF

Integração autorizada após duas amostras reais: `packages/map-reference/src/inpe.ts`, `inpe-source.ts` e `inpe-geometry.ts` consultam a coleção oficial RGB fusionada de 2 m e conferem sua licença CC BY 4.0. A API retorna a prévia SVG com metadados de estado/cena/data/resolução; o worker incorpora imagem e créditos à emissão. Falha ou falta de cobertura não bloqueia a emissão: o PDF registra o aviso e preserva o croqui vetorial. Nenhum ponto é reposicionado para buscar cobertura.

O enquadramento e a transformação são compartilhados com a prancha600×520. Janelas de leitura são limitadas, apenas por HTTP Range, com host/caminho fixos, sem redirecionamentos; qualquer canal RGB com zero é rejeitado como NoData. São consultadas no máximo seis cenas. Os limites de rede, memória, abrangência, cache e concorrência estão documentados no README. A execução de produção é JavaScript, sem dependência de Python. A imagem não tem garantia de ausência de nuvens ou precisão cadastral. A data/cena no PDF são as efetivamente usadas na geração, não uma promessa de congelamento da prévia anterior.

Testes: 61 unitários, 14 integrações e seis de navegador passaram, além de tipos, build e formatação. A integração inclui emissão privada pelo worker com imagem sintética; o navegador cobre imagem disponível, falta de cobertura e recuperação. Layouts extensos foram testados com imagem e com avisos. O renderizador JavaScript também leu imagem real de Brasília; o relatório completo de demonstração foi rasterizado em quatro páginas e inspecionado, preservando texto selecionável, fonte, data e licença. O código mantém os perfis SPT e as fotografias no padrão aprovado. Imagens reais não são usadas nos testes automatizados dependentes de rede.
