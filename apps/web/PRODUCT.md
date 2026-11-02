# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Equipes de sondagem SPT, com usuários vinculados a empresas e perfis de acesso.

## Product Purpose

SaaS SPT conforme MVP-001. A interface organiza acesso, obras, pastas, furos, dados técnicos, localização/fotos e composição de relatórios de sondagem da empresa, com separação entre dado medido, revisão técnica e emissão de homologação.

## Capabilities and Constraints

React/TypeScript, API NestJS e PostgreSQL/Prisma. Login exige email, senha e ID da empresa; MFA opcional, sem cadastro público. Obras oferece busca e paginação de 20 itens; ENGINEER e COMMERCIAL cadastram/editam obras. Contratante continua um campo textual: o cadastro separado de clientes não cria vínculo automático. Pastas e identificação de furos são editadas pelo ENGINEER. ADMIN mantém lixeira lógica/restauração e administração de acessos, sem receber edição técnica por esse perfil isolado.

A lista oferece uma única ação Abrir furo. Dentro do furo, Visão geral reúne contexto e Editar identificação para ENGINEER; Registro de campo reúne SPT, solo e dados medidos; Análise geotécnica reúne leitura técnica; Revisão técnica mantém envio, devolução e aprovação. ADMIN e COMMERCIAL isolados acessam somente Visão geral. ENGINEER, OPERATOR (Sondador) e VIEWER (Consulta legado) veem as áreas técnicas, com ações conforme a permissão. Não há duas entradas equivalentes para a mesma tarefa.

Sondador preenche/corrige ensaios SPT, solo e dados de campo enquanto DRAFT e envia para análise. Depois do envio, perde escrita até devolução explícita pelo ENGINEER. Não edita identificação nem coordenada planejada. ENGINEER corrige, aprova e emite; correções em IN_REVIEW ou após aprovação deixam o furo IN_REVIEW, sem liberar automaticamente a escrita de campo. ADMIN isolado não edita técnica, aprova ou emite. Até três avanços usam golpes e penetração em centímetros, persistidos em milímetros; o servidor calcula o resultado, mantendo casos incompletos/interrompidos/especiais sem N-SPT definitivo. Tipo e descrição de solo permanecem manuais, sem classificação automática. Aprovação técnica existente não é assinatura digital com certificado.

Acessos permite a ADMIN criar logins com senha inicial de 12–128 caracteres, atribuir perfil principal e additionalRoles[] por escolha explícita, ativar/desativar o vínculo na empresa e configurar download para perfis de consulta. Nenhuma função adicional é concedida automaticamente. Há proteção do próprio/último administrador e auditoria membership_events. Comercial cadastra/edita clientes e obras. Consulta legado permanece disponível; permissões combinadas são a união das funções escolhidas explicitamente. Não há atribuição de furos a usuários neste incremento.

Fotografias JPEG/PNG são privadas, preservam o original e aceitam legenda/recorte separados; fotos sem GPS são utilizáveis. Coordenadas UTM SIRGAS2000 podem ser planejadas ou executadas, com seleção explícita de referência oficial. A conferência entre GPS e coordenada é aproximada, alerta acima de 10m e não altera a referência automaticamente.

Relatórios por obra têm composição ordenada de até 20 furos e 40 fotos. ENGINEER edita composições e solicita geração; ADMIN isolado não recebe essas ações. Emissão exige aprovação atual e coordenada oficial de cada furo. Há snapshot congelado, worker separado, armazenamento privado e histórico de PDFs com hash; a interface abre o histórico ao salvar a composição, acompanha automaticamente emissões pendentes e oferece download no histórico e diretamente na lista quando há PDF vigente READY. Atualizar emissões permanece disponível. Download depende também da configuração de consulta da empresa; somente ENGINEER aprova e emite. O modelo é inicial para homologação, sem comparação com o Excel oficial ainda ausente, sem assinatura digital ICP-Brasil e sem alegação de conformidade normativa completa. Croqui técnico tem prévia e enquadramento automático ou ajustável por centro UTM e abrangência, congelado no snapshot; os eixos usam escala uniforme. Google Maps permanece como consulta opcional de localização na interface através de Maps Embed API. Usa GOOGLE_MAPS_API_KEY; sem chave, mostra instrução e link externo. O croqui mantém furos, norte e escala vetoriais e agora usa fundo gratuito INPE/CBERS-4A quando disponível, na prévia e nas novas emissões. Mostra data, pixel de 2 m, licença e cena; sem cobertura útil ou em falha, mantém o desenho vetorial com aviso e opção de tentar novamente. INPE não exige chave. Casos geotécnicos especiais ainda exigem referência validada. A interface de relatórios foi exercitada no fluxo de navegador local até download do PDF. Fotografias novas usam processamento assíncrono no worker e permanecem em quarentena até READY; a fila passou na execução conjunta de integração, e a suíte posterior passou com 26 testes unitários, 12 de integração e seis de navegador, incluindo processamento assíncrono e enquadramento do croqui. Segurança da conta permanece disponível em área própria.

A fase atual é somente local, para testar e corrigir erros; publicação foi adiada. Com o acesso dedicado de desenvolvimento habilitado, a barra Perfil de teste permite alternar Administrador, Engenheiro, Sondador, Comercial e Consulta pela API autenticada, alterando apenas a conta exclusiva local. Esse controle não aparece no acesso normal; a troca foi verificada nos quatro perfis por HTTP e no navegador local, sem exceções de página ou overflow móvel.

## Product Principles

Código simples e modular. Conteúdo real. Estados claros. Isolamento entre empresas.

## Brand Commitments

Português; interface clara e discreta focada em acesso à empresa e MFA, direção confirmada pelo usuário em 31/10/2026. Marca atual: Metro — Gestão Inteligente. Logo tipográfica em minúsculas com ponto quadrado azul, aplicada por escolha explícita do usuário em 02/11/2026.

## Atualização de preenchimento por metro

Golpes e solo são preenchidos juntos em Ensaios SPT, com uma única gravação atômica e verificação da versão técnica. Registrar metro, Editar metro, Salvar metro e Salvar e próximo metro compõem o fluxo principal. Dados do furo e revisão reúne dados gerais e aprovação. A descrição do solo nunca é inferida dos golpes nem repetida automaticamente no próximo metro.

## Incremento de campo e conferência — E09

Solo possui cor e umidade opcionais por intervalo. Ensaio guarda método e recuperação. Reabertura de metro é explícita e salvar/próximo não duplica metros existentes. Dados do furo incluem checklist e perfil visual acessível. Fotos têm finalidade. Obras mostram andamento derivado dos furos ativos. Relatórios têm central global paginada; notificações internas de revisão/emissão têm leitura por usuário, atualização visível a cada 30s e acesso ao registro. Preservadas todas as regras de cálculo, revisão e emissão. Detalhes e limites em docs/E09-fluxo-campo.md.

### Análise interativa do furo

Página nativa para análise geotécnica: solos por camada, leituras por metro, curvas SPT animadas, NA e métodos em escala compartilhada. Seleção sincronizada com detalhes/fotos, zoom e navegação por trechos; edição permanece explícita. A visualização não reproduz o boletim PDF. Lavagem por tempo ainda não é coletada pelo cadastro e aparece como ausência, sem inferência.

## Estado do solo por N-SPT — E12

A regra isolada NBR6484-2020-A1-v1 calcula compacidade ou consistência a partir do tipo predominante informado e N-SPT CONVENTIONAL inteiro não negativo. Não identifica o tipo pelo N. Areia/silte arenoso recebem compacidade; argila/silte argiloso recebem consistência. Silte sem qualificativo, tipo desconhecido/ambíguo e resultado não definitivo ficam sem classe. Estado aparece no resultado/lista, na análise e nos detalhes por metro/camada, podendo variar entre metros. A referência recolhível explicita as faixas. PDF novo 0.8.5 inclui estado antes da descrição por metro; snapshot guarda soilStateRuleVersion, sem reescrever medições, aprovações ou emissões antigas. Detalhes e limites em docs/E12-classificacao-nspt.md.
