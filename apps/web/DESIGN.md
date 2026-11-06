---
name: Metro
description: Metro Gestão Inteligente com marca tipográfica e azul cobalto.
colors:
  brand: '#1600ff'
  brand-hover: '#1200cc'
  ink: 'oklch(0.18 0.010 60)'
  muted: 'oklch(0.50 0.008 60)'
  page: 'oklch(0.985 0.004 70)'
  surface: 'oklch(1 0 0)'
  subtle: 'oklch(0.965 0.006 70)'
  intro: '#f1e8dd'
  line: 'oklch(0.88 0.004 60)'
  input-line: 'oklch(0.70 0.006 60)'
  focus: 'oklch(0.55 0.120 235)'
  selection-bg: '#e8e6ff'
  selection-text: 'oklch(0.18 0.010 60)'
  placeholder: 'oklch(0.50 0.008 60)'
  status-bg: '#dcead8'
  status-text: '#21472f'
  danger: '#8c302c'
  danger-hover: '#70221f'
  error-bg: '#fcebe7'
  error-text: '#8b2824'
  notice-bg: '#dcead8'
  notice-text: '#21472f'
  recovery-bg: 'oklch(0.965 0.006 70)'
  scrollbar: '#b8afa4'
  generate-report: '#236b45'
  generate-report-hover: '#195334'
typography:
  display:
    fontFamily: 'Fraunces, Georgia, serif'
    fontSize: 'clamp(40px, 5vw, 72px)'
    fontWeight: 600
    lineHeight: 1.08
  headline:
    fontFamily: 'Fraunces, Georgia, serif'
    fontSize: '30px'
    fontWeight: 600
    lineHeight: 1.55
  section:
    fontFamily: 'Fraunces, Georgia, serif'
    fontSize: '26px'
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: 'IBM Plex Sans, sans-serif'
    fontSize: '19px'
    fontWeight: 600
    lineHeight: 1.55
  body:
    fontFamily: 'IBM Plex Sans, sans-serif'
    fontSize: '15px'
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: 'IBM Plex Sans, sans-serif'
    fontSize: '14px'
    fontWeight: 600
    lineHeight: 1.55
  help:
    fontFamily: 'IBM Plex Sans, sans-serif'
    fontSize: '13px'
    fontWeight: 400
    lineHeight: 1.55
  mono:
    fontFamily: 'IBM Plex Mono, monospace'
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.55
rounded:
  control: '8px'
  tree-row: '4px'
  surface: 'oklch(1 0 0)'
  alert: '5px'
  status: '20px'
spacing:
  compact: '8px'
  control-gap: '12px'
  field-gap: '16px'
  row: '20px'
  section: '24px'
  panel: '24px'
  workspace: '24px'
components:
  button-primary:
    backgroundColor: '{colors.brand}'
    textColor: '{colors.surface}'
    rounded: '{rounded.control}'
    padding: '8px 16px'
    height: '36px'
  button-primary-hover:
    backgroundColor: '{colors.brand-hover}'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.ink}'
    rounded: '{rounded.control}'
  panel:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.surface}'
    padding: '24px'
---

# Design System: Metro

## Overview

O usuário autorizou adotar o padrão visual do frontend sondagem. Este registro descreve o código atual: terracota para ações, grafite quente para leitura, superfícies claras e títulos serifados. A identidade anterior verde/Public Sans foi substituída; os fluxos, permissões e dados do produto permanecem os existentes.

**Key Characteristics:**

- Ações em terracota e superfícies de papel quente.
- Fraunces nos títulos; IBM Plex Sans nos controles; IBM Plex Mono nos dados copiáveis.
- Navegação lateral recolhível no desktop e menu deslizante no celular; temas claro/escuro; ícones Lucide.

## Colors

### Primary

Terracota identifica a ação principal, a seleção de navegação e a ênfase na marca; hover usa a variante mais profunda.

### Neutral

Grafite quente identifica o texto, com tom secundário para contexto e ajuda. Página clara, painéis brancos e divisores quentes definem agrupamentos. Introdução e acesso local usam superfície bege.

### Semantic states

Azul é reservado ao contorno de foco. Estados positivos mantêm seus verdes sem convertê-los na marca; perigo e erro preservam seus próprios tons vermelhos. Seleção de texto usa pêssego e texto castanho.

**The Semantic State Rule.** Cor de marca identifica ação; mensagens de estado mantêm texto explícito e sua semântica própria.

## Typography

Fraunces 600 identifica h1/h2; IBM Plex Sans 400/500/600/700 sustenta texto e controles; IBM Plex Mono 400 identifica chave, códigos de recuperação e hashes. Todas são importadas localmente em main.tsx, sem dependência de fonte remota.

O corpo tem 15px e entrelinha 1.55, com parágrafos até 70ch. O título da empresa tem 30px, reduzido a 28px até 760px; seções usam 26px, títulos menores 19px, ajuda 13px e rótulos 14px. A marca usa Fraunces 16px no menu e 24px no acesso. Controles móveis usam texto 16px para evitar zoom automático.

## Layout

A partir de 1024px, o menu lateral reserva 256px; recolhido, 64px. Cabeçalho e área da marca têm 64px. No modo compacto a marca fica oculta e cada destino mostra ícone, nome acessível e dica ao passar o ponteiro ou focar. Conteúdo tem 24px de preenchimento e rodapé global cobre toda a largura.

Até 1023px, o menu fica em diálogo modal nativo deslizante, acionado por Abrir menu. O fundo fica inativo; Escape, Fechar menu e clique fora fecham e devolvem foco ao acionador. Escolher destino fecha o menu. Até 760px, conteúdo usa 16px; alvos de formulário mantêm mínimo 44px.

Acesso usa cartão centralizado de até 448px, marca, formulário e ajuda. Campos de empresa e MFA são mantidos por exigência real do produto. Obras e furos usam linhas independentes com borda e cantos de 12px, separadas por 16px; busca e filtros permanecem funcionais.

O editor SPT chega a 960px: três avanços lado a lado, com gap de 24px, e um avanço por linha até 760px. No móvel, golpes e penetração permanecem lado a lado dentro de cada avanço. Stepper usa trilhos 44px no desktop e 36px no móvel; rótulos reservam altura para alinhamento.

## Elevation & Depth

Superfícies e bordas definem os níveis. Linhas acionáveis recebem sombra suave no hover, como na referência; o menu móvel usa fundo escurecido para manter foco na navegação.

Evitar efeitos sem função; transições de cor duram 150ms, recolhimento lateral 200ms, abertura do menu móvel 300ms e fechamento 200ms. Indicadores de carregamento giram em 1s. Todos os movimentos respeitam prefers-reduced-motion.

## Shapes

Controles têm raio de 8px; painéis, listas e estados vazios têm 12px; alertas mantêm 5px e status 20px. A confirmação de lixeira mantém 8px. Botões e campos têm altura mínima de 36px no desktop e 44px no celular. Foco usa contorno de 2px afastado 2px.

## Components

### Buttons

A ação principal usa fundo terracota, texto branco no claro e castanho escuro no escuro, com peso 500. A secundária usa fundo transparente e contorno; hover recebe preenchimento claro. A ação de desativar MFA usa a variante de perigo e um tom de perigo mais escuro no hover. Desabilitados usam opacidade 0.5. A transição de cor dura 0.15s com ease somente quando o usuário não pede redução de movimento.

### Inputs / Fields

Campos brancos com borda própria, rótulo visível e ajuda abaixo quando aplicável. Foco de teclado usa contorno de 2px, afastado 3px. Erros aparecem junto ao formulário com papel de alerta. A chave de configuração é somente leitura e selecionável. O motivo de interrupção do ensaio usa textarea com a mesma superfície, borda e foco dos campos existentes; o textarea SPT mantém raio específico de 5px pela maior especificidade do seletor, espaço interno de 12px e redimensionamento vertical. Profundidade planejada usa campo numérico com passo de 0,01m e unidade explícita no rótulo; a pasta usa select nativo com opção Sem pasta e ajuda para carregar opções adicionais.

### Cards / Containers

O painel de segurança usa a superfície branca e a borda de separação. A configuração do autenticador é separada por divisores horizontais, sem painel aninhado.

### Navigation

A barra lateral agrupa marca, Obras, Clientes conforme perfil, Acessos e Lixeira somente para ADMIN, além de Segurança da conta, com os ícones FolderOpen, ShieldCheck e Trash2 (Lucide, traço 1.75). A seleção mantém aria-current. Recolher/expandir usa PanelLeftClose/PanelLeftOpen; no celular Menu/X abrem/fecham o diálogo. Cabeçalho oferece tema Sun/Moon, perfil UserRound e saída LogOut. As preferências spt.theme e spt.sidebarCollapsed podem ser persistidas localmente; autenticação continua somente em memória. Durante guarda dos códigos, navegação e saída permanecem bloqueadas.

Os ícones das ações são componentes explícitos: Plus, Pencil, Save, Search, Trash2, Download, FileText, MapPin, ClipboardList, ClipboardCheck, ArrowLeft/Right/Up/Down e RefreshCw. O componente Button preserva tipo nativo, submissor, nomes acessíveis, estado disabled e spinner Loader2 quando necessário.

### Status and recovery codes

Estados de MFA e sessão usam o mesmo selo discreto. Na recuperação, o estado do cabeçalho muda para “Guarde os códigos” e a saída da conta fica desabilitada. A lista usa códigos reais, quebráveis, com numerais tabulares; o retorno ao acesso exige confirmar que foram guardados. O texto orienta a não recarregar antes de salvá-los.

### Works list and editor

A listagem é textual, com título de obra e informações complementares em segundo plano, delimitada por linhas. O nome da obra é um botão textual, com sublinhado no hover que abre sua hierarquia; mantém fundo transparente, alinha à esquerda e muda o texto para o terracota de ação no hover. Os controles de linha usam Editar ou Ver dados conforme a permissão; o título específico também integra o nome acessível do botão. A busca exige envio explícito e a paginação apresenta Anterior, número da página e Próxima. Carregamento, falha recuperável e ausência de resultados têm mensagens próprias.

O editor é inline, dentro do painel já existente, e não um modal. Campos opcionais são indicados junto do rótulo. UF usa select nativo com a mesma superfície, borda, altura e foco dos inputs. Campos ficam desabilitados na consulta e durante o salvamento; salvar e fechar são ações separadas. Quando há erro ao salvar, o erro pode oferecer Recarregar dados da obra, mantendo o problema junto ao editor.

### Work hierarchy

O botão Voltar às obras precede o nome da obra. Pastas e Furos têm títulos e ações próprios, preservando a hierarquia textual sem acrescentar cartões por item. Na raiz da obra, Pastas apresenta nomes acionáveis com a mesma variante textual com sublinhado no hover já usada nos nomes de obra, além de Renomear quando permitido. Nomes de pasta herdam o tamanho de corpo (15px), com peso 600, sem promover-se ao título de obra; a lista de furos recebe o título Furos sem pasta. Abrir o nome de uma pasta substitui esse contexto por Pasta: nome e Furos em nome, oculta a lista de pastas e oferece Voltar às pastas antes da listagem. A pasta aberta vem pré-selecionada ao cadastrar um furo. Furos apresentam identificação, pasta ou Sem pasta e profundidade planejada ou sua ausência. A identificação usa o papel tipográfico menor de 18px. O bloco textual da linha pode encolher (`min-width: 0`) e a identificação permite quebra em qualquer ponto (`overflow-wrap: anywhere`), mantendo códigos longos dentro da largura disponível sem deslocar a ação.

Criação e edição são formulários inline, com somente um editor aberto por vez. Apenas perfis de escrita recebem controles de criar, renomear ou editar. O carregamento adicional de pastas é um botão explícito, acompanhado da contagem carregada; furos usam Anterior e Próxima. Salvar desabilita os controles do editor. Erros aparecem em alerta junto ao conteúdo e oferecem Recarregar dados; essa ação fecha os editores e consulta a versão atual.

### Trash and destructive confirmation

A ação inicial Lixeira usa o botão secundário. Ao acioná-la, a confirmação aparece inline na própria linha, nomeia o registro e explica que poderá ser restaurado por um administrador. O grupo combina Confirmar envio na variante de perigo e Cancelar envio na variante secundária, sem abrir modal. Usa superfície branca, borda existente, raio de 8px, espaço interno de 16px e largura máxima de 440px. Durante a requisição, confirmar e cancelar ficam desabilitados; a falha permanece como alerta junto da confirmação.

Na área Lixeira, o texto inicial informa a ordem de restauração e a ausência de exclusão definitiva. O filtro Tipo de registro alterna Obras, Pastas e Furos e reinicia a paginação. Restaurar usa ação secundária com o nome do registro no nome acessível. Sucesso usa o aviso existente; erro permite Recarregar lixeira. Estado vazio tem título e orientação, e páginas vazias posteriores à primeira oferecem retorno à primeira página.

### SPT entry and result

A ação única Abrir furo conduz à Visão geral; Registro de campo integra a navegação interna, conforme o perfil. Dentro da tela, o título identifica o furo e o texto de contexto mostra a obra. Perfis de escrita recebem Registrar ensaio e Editar ensaio; os demais visualizam os registros e resultados sem controles de alteração.

O editor é inline, com profundidade inicial explícita em metros, três grupos de avanço, rótulos com ordinal e penetração explícita em centímetros. Golpes usam controles de diminuir/aumentar e campo numérico; penetração mantém entrada numérica e atalho de 15 cm com aria-pressed. Solo deste metro usa input com datalist nativo de sugestões, permitindo texto livre; descrição permanece manual e não é inferida dos golpes. A ordem comunica sequência real de medição. Campos não executados podem ficar vazios; a ajuda distingue vazio de zero medido. Falhas de preenchimento ou de salvamento aparecem no alerta existente, com opção Recarregar ensaios. Salvar e Cancelar usam as variantes existentes.

Após salvar, o resultado reutiliza o painel e exibe o estado textual, N-SPT ou Não calculado e a ressalva de que o cálculo não é aprovação técnica. Não há nova codificação por cores ou selo de aprovação. A lista mantém profundidade, estado, N-SPT e avanços medidos em texto, mais o motivo de interrupção quando informado. O estado vazio informa que ainda não existem registros no furo.

### Technical details and review

O acesso Solo e dados do furo abre dados de campo, camadas, localização/fotos e revisão na mesma área de trabalho. Campos indicam unidade e opcionalidade; tipo/descrição de solo são informados pelo usuário e exibidos como texto com quebras preservadas. A revisão usa estados escritos, versão técnica e parecer, sem acrescentar selo gráfico de certificação. Enviar, aprovar e devolver abrem formulários inline com confirmação e cancelamento. Histórico pode ser expandido; as ações disponíveis seguem o perfil e estado atual.

### Photographs and coordinates

Planejada, Executada e Oficial são identificações textuais das coordenadas. As ações de editar e escolher referência oficial reutilizam botões secundários. Formulários de coordenadas usam pares de campos, unidade no rótulo, origem e ajuda sobre a necessidade de nova revisão. Fotografia privada é carregada sob demanda em prévia proporcional com legenda como texto alternativo. Fotos ainda não READY informam processamento ou falha antes de apresentar os dados de GPS. A mensagem de GPS é conferência aproximada e informa que a referência oficial foi preservada.

Upload, legenda e recorte são formulários inline; recorte é definido por porcentagens e aplicado na composição do PDF, sem editor gráfico de arraste nesta versão. Remoção de foto tem confirmação explícita junto das ações e preserva o objeto original histórico.

### Report composition and issue history

O código da nova interface oferece retorno à organização da obra, título com o nome da obra e aviso de modelo inicial de homologação. A composição usa checkboxes nativos compactos de 20px, com acento terracota, rótulo ao lado, espaço de 12px e quebra de texto; o controle não encolhe. Listas ordenadas oferecem Subir, Descer e Retirar, sem exigir drag-and-drop. Limites são explicitados no texto de ajuda. A opção de mostrar outros furos descreve os furos de referência no croqui técnico.

A prévia do croqui mantém proporção com largura disponível, altura automática, limite de 560px e object-fit contain; seu contêiner usa margem vertical de 28px. Ajustar enquadramento oferece centro leste/norte UTM e abrangência em metros, retorno ao automático, salvar e cancelar. A composição versionada congela a vista aprovada para emissão; a escala é uniforme nos eixos.

O histórico mostra número da emissão, estado textual, versão da composição, Vigente/Histórica quando aplicável e hash disponível. A ação de geração é rotulada Gerar PDF de homologação e aparece apenas para ENGINEER. ADMIN isolado não recebe edição técnica nem geração; controles de consulta/download seguem as funções explícitas e configuração da empresa. Salvar a composição abre seu histórico. Enquanto há emissão PENDING/PROCESSING e o editor está fechado, a tela atualiza após 1,5 segundo e depois aproximadamente a cada dois segundos; interrompe ao concluir ou falhar. Atualizar emissões permanece explícito como alternativa manual. Baixar PDF aparece para READY no histórico e, havendo emissão vigente, diretamente na lista de relatórios. Erros recebem foco e opção de recarga. Capturas desktop/celular e o fluxo de navegador local foram conferidos; isso não equivale à homologação do modelo PDF oficial ausente.

### Local test toolbar

Somente no acesso dedicado de desenvolvimento, a barra Acesso de teste local usa superfície bege, preenchimento vertical de 16px e horizontal mínimo de 20px, alinhado ao contêiner de 1268px. Flex com quebra e espaço de 12px mantém rótulo Perfil de teste e seletor nativo com largura automática e limite de 100%. Até 760px, o texto da barra ocupa uma linha completa. A troca altera a permissão real da conta local e recarrega o perfil; o controle fica desativado durante operação ou guarda obrigatória de códigos. O acesso normal preserva seu fluxo existente.

### Furo workflow and management

A lista oferece somente Abrir furo; Identificação é uma seção interna exclusiva de ENGINEER, sem abandonar o furo. As seções mantêm seus nomes e agora incluem Identificação e Fotografias, conforme perfil, além de Visão geral, Registro de campo, Análise geotécnica e Revisão técnica. Navegação usa ícones Eye, ClipboardList, ChartNoAxesCombined e ClipboardCheck, texto explícito e controles de pelo menos 44px. Até 600px, dispõe-se em duas colunas, com texto de 13px e preenchimento de 10px. Guardas de edição impedem perder alterações ao trocar contexto; campos e ações condicionais refletem a permissão e o estado técnico, sem duplicar entradas.

ADMIN/Comercial isolados veem somente Visão geral e não recebem análise. Sondador vê Visão geral e Registro de campo, com envio por nota/checklist nessa própria seção; não vê análise nem revisão. Engenheiro acessa análise/revisão e ações de corrigir, devolver, aprovar e emitir. Consulta vê análise somente leitura, sem seção Revisão técnica. O bloqueio de campo após envio é explicado em texto; somente a devolução pelo engenheiro reabre a escrita do Sondador. Perfis adicionais aparecem apenas quando escolhidos explicitamente em Acessos.

Acessos e Clientes reutilizam o mundo Estratos, sem nova paleta. Formulários administrativos têm largura máxima de 720px e margem vertical de 24px; seleção de perfis e opções usam rótulos flexíveis com altura mínima de 44px, gap de 10px e checkbox nativo de 18px. Ações de salvar/ativar/desativar são explícitas, com proteção do próprio/último administrador. Clientes permanece um cadastro separado do campo contratante textual da obra.

Na análise, cada valor de golpes é centralizado na mesma ordenada de sua profundidade, ponto e método: o texto usa top 50%, translateY(-50%) e entrelinha de 20px; o auxiliar permanece na base, com entrelinha de 14px. O critério DOM do incremento limita o desvio entre centros a 1px; números finais da suíte ainda não foram confirmados neste registro.

## Do's and Don'ts

### Do:

- **Do** manter rótulos visíveis acima dos campos.
- **Do** usar as variantes existentes para distinguir ação principal, secundária e desativação de MFA.
- **Do** preservar a disposição empilhada e os controles largos em telas pequenas.

### Don't:

- **Don't** usar a cor de erro para mensagens de estado normal.
- **Don't** substituir os códigos reais por elementos decorativos na área de recuperação.

## Fluxo conjunto por metro — 01/11/2026

Preservada a identidade existente. O editor SPT inclui fieldset Solo deste metro com intervalo explícito, tipo obrigatório e textarea de descrição obrigatória. Usa os campos, divisores e fieldsets existentes. Salvar metro é principal; Salvar e próximo metro e Cancelar são secundários, com quebra/empilhamento móvel existente. Erros preservam o formulário. A navegação para Dados do furo e revisão fica desabilitada durante edição, e a recarga explicita que fecha a edição. Listagem mostra solo junto aos avanços. Conferido em desktop1440px e celular390px no fluxo real.

A área de croqui mantém sua identidade atual e mostra uma referência Google acima do desenho técnico. O quadro incorporado tem largura disponível e altura de 360px; o link “Abrir localização no Google Maps” oferece consulta em nova aba. Sem chave, há ajuda explícita e o link continua disponível. Não há seletor de provedores nem opções Esri/OpenFreeMap. A ajuda distingue a consulta Google do croqui que entra no PDF, com imagem INPE quando há cobertura útil. Ajustar enquadramento preserva os controles anteriores.

A prévia do croqui usa o próprio SVG existente com fundo INPE incorporado, norte e escala em área clara e marcadores vetoriais. Abaixo da imagem, a ajuda mostra data, pixel, créditos, licença CC BY 4.0 e código da cena. Em falta de cobertura ou falha de serviço, a mensagem de estado explica que os furos permanecem disponíveis e oferece “Tentar carregar imagem INPE”. Abrangência acima de 1.500 m recebe orientação específica. Não há campo de chave INPE ou cobrança na interface.

## Referência visual e validação — ícones e interações

Origem: frontend em Documents/_Projetos/sondagem. Os arquivos logo-mark.svg e logo-mark-dark.svg foram reutilizados desse projeto do usuário; não foram redesenhados. Os tokens Estratos claros/escuros foram transcritos de app/globals.css. Componentes locais Button, Brand, AppShell e LoadingState adaptam a apresentação ao React/Vite existente. Não há destinos fictícios para módulos que o backend ainda não oferece.

Foram testados menu compacto, abertura e fechamento móvel por Escape, retorno de foco, redução de movimento, troca de tema, fluxo MFA e preservação da autenticação em memória, além das telas existentes de obras, pastas, furos, SPT e relatórios.

## Incremento de campo e conferência

Os novos componentes mantêm Estratos e Lucide. Método/recuperação e cor/umidade usam pares de campos nativos; vazio segue distinto de zero. Checklist usa CheckCircle2/Circle e texto explícito Concluído/Pendente, com identificação da etapa. Perfil usa SVG geométrico com tabela e lista de camadas equivalentes; rolagem horizontal e foco permitem conferir a escala completa em telas pequenas. Cores apenas distinguem intervalos, sem classificação automática.

Andamento das obras usa lista de definições com contagens reais e filtro nativo. Relatórios integra a navegação principal e usa a listagem existente. Bell abre atividades recentes em painel de até 360px; no celular fica dentro das margens de 16px e altura máxima 70dvh. Leitura usa texto Não lida e contador. Escape devolve foco ao acionador. Breadcrumb usa lista de níveis com ChevronRight e nomes reais; níveis que descartariam edição SPT ficam sem ação até salvar/cancelar.

## Organização de pastas em árvore

Referência HTML/CSS fornecida pelo usuário. FolderTree usa painel de 320px no desktop, borda existente, raio 8px e preenchimento 24px. Linhas de ligação têm 1px e recuo de 11px + 11px. Linhas compactas usam 14px, raio 4px e altura mínima 28px; no celular, altura e alvos de ação sobem para 44px e o painel ocupa a largura disponível, com preenchimento 16px.

Ícones Folder/FolderOpen e ChevronRight indicam expansão; FileText identifica furos. Seleção da pasta usa superfície sutil e peso 500. Abertura usa grid-template-rows 0fr/1fr em 300ms ease-in-out; redução de movimento elimina a transição. Botões nativos expõem aria-expanded e aria-controls; ramos fechados usam inert e aria-hidden. CSS é restrito à árvore, sem mudar listas globais.

A árvore fica à esquerda da lista de furos da pasta; até 1100px, os painéis empilham. Árvore possui rolagem para grandes conjuntos (640px no desktop, 440px no celular). Furos são consultados por pasta e paginados; pastas carregadas permanecem disponíveis ao trocar de contexto. Renomear e lixeira mantêm permissões e confirmação existentes. Selecionar furo de outro ramo atualiza o caminho para sua pasta real.

### Análise geotécnica do furo

A página **Análise do furo** substitui a reprodução do boletim. É um perfil nativo HTML/SVG, sem iframe ou geometria A4: profundidade, camadas, golpes, resistência e método usam escala vertical comum de 64 px/m. Trechos de até 20 m, zoom de 20–200% e ajuste à largura; painel de detalhes/fotografias à direita, alternado em telas até 1200 px. Seleção de camada destaca intervalo e registros relacionados; seleção de metro ou curva consulta o registro real. Curvas azul #2155b5 (1º+2º) e vermelho #c62828 (2º+3º), variantes escuras #91b9ff / #ffabab. Hachuras geométricas representativas distinguem solos, sem inferir cor real ou classificação. Entrada do traço animada em 900 ms, desativada por prefers-reduced-motion. Leitura parcial terminal destacada abaixo do último metro evita sobreposição. Métodos, NA e encerramento usam dados salvos; lavagem por tempo indica ausência porque o cadastro atual ainda não possui essas medições. O boletim PDF permanece independente.

Alinhamento por faixa geológica: o registro de 1 m ocupa 0–1 m; o de 2 m ocupa 1–2 m. As linhas de golpes e método usam exatamente os mesmos limites dessas faixas. Valores e pontos das curvas ficam no centro da faixa; marcas de profundidade, NA e encerramento continuam nas coordenadas físicas dos limites. A leitura parcial terminal mantém sua faixa separada. Verificação DOM das bordas e centros: tolerância de 1 px.

### Estado do solo e critérios de referência

A extensão preserva Estratos e a geometria de profundidade/curvas. Compacidade/consistência são texto junto ao resultado salvo, lista e N-SPT da análise, sem inventar selo de aprovação ou inferir tipo de solo. Apenas o resumo compacto da leitura usa linha única com ellipsis; title traz o estado/referência e os detalhes mantêm o texto integral. Detalhes distinguem estado por metro e variações dentro da camada.

Critérios de compacidade e consistência usa details/summary nativo, margem inferior de 20px, espaço vertical de 12px e bordas horizontais existentes. O summary tem peso 600 e altura mínima de 32px. Duas tabelas semânticas usam corpo de 14px, células de 8px e legendas explícitas; grade de duas colunas com gap de 24px e margem superior de 16px, empilhada até 760px. A classificação herda o tamanho do texto onde aparece. Capturas do incremento incluem referência, desktop, tema escuro e móvel; testes finais de navegador estavam em fechamento no registro.

Descrição contínua de solo: unir tipo, classificação, cor, umidade e descrição por vírgulas; manter abreviações e pontuação interna digitadas. Não usar pontos ou marcadores centrais como separadores na frase completa. Campos e rótulos individuais permanecem separados na interface.

A segregação atual mantém funções adicionais explicitamente cumulativas: Administrador não implica Engenheiro. Workspace de relatórios exclui Sondador isolado; Comercial/Administrador/Consulta mantêm consulta e download condicionado, sem geração. Engenheiro conserva cadastro de clientes/obras. Camadas manuais e coordenada planejada exigem Engenheiro. A correção não muda identidade visual ou PDF.

### Posição das ações e registro inicial — E13

A solicitação melhora a posição dos controles sem renomear os nomes existentes. Navegação do furo permanece no topo durante leitura longa: sticky a 64px, superfície existente, z-index 8 e preenchimento vertical de 12px. Quando a guarda está ativa, seu fieldset contém a posição sticky e a navegação interna fica estática. Identificação abre dentro do furo para ENGINEER; Fotografias segue o perfil de campo. Campos e fotos com alterações não salvas preservam guarda antes de trocar contexto.

Obra nova permite quantidade inicial de 0–200 furos e nome de pasta opcional; sem pasta, os furos aparecem diretamente na raiz, sem pseudopasta. O primeiro metro novo (0–1 m) mostra aviso textual de solo/método sem golpes, avanços ou N-SPT. Dados legados do metro 1 permanecem. Descrição complementar de solo e legenda de foto são opcionais. Repetir tipo e cor do metro anterior é ação explícita, sem copiar automaticamente a descrição. Não executado limpa o avanço e os seguintes. Último metro do furo registra encerramento com valores ausentes preservados, sem transformá-los em zero.

Gerar PDF usa variante verde própria, sem trocar a marca terracota. Texto e ícone mantêm o nome existente. Hover aprofunda o verde e adiciona sombra 0 3px 8px #123c2926; transições de fundo/sombra duram 0,2s. A revelação do ícone em 0,45s e movimento de processamento em 1,2s só são aplicados com prefers-reduced-motion: no-preference. Esta variante é exceção localizada à superfície plana, não regra para todos os botões.

### Leituras parciais e último metro — E14

Leituras medidas não convencionais continuam visíveis nas séries com dados suficientes. A linha segue até o último metro com os círculos existentes, sem losangos, rótulos ou anotações adicionais no gráfico. As cores são preservadas e nenhum avanço ou N-SPT é inventado. Texto acessível continua disponível para consulta por teclado.

Rótulos dos limites 20/40 m são contidos no quadro; no último metro da tela, os rótulos são posicionados abaixo para não sobrepor leitura e encerramento. O template 0.8.8 reproduz a correção sem redesenhar o sistema ou reescrever emissões anteriores. Medições, N-SPT e classificação permanecem distintos da representação gráfica.

### Login explícito — E15

A tela normal de entrada é preservada mesmo com o bypass local habilitado. O botão secundário Entrar no ambiente de teste oferece essa alternativa explicitamente; nenhuma sessão é criada só por abrir a página. O cabeçalho da sessão de teste não anuncia login automático. Contas, permissões e identidade visual permanecem.


## Metro identidade aprovada em 02 de novembro de 2026

Este incremento substitui a identidade terracota descrita nas seções históricas acima. Nome e assinatura: Metro — Gestão Inteligente. Wordmark metro em minúsculas com ponto quadrado azul, assinatura alinhada à esquerda e ícone m. em quadrado azul. Os vetores locais usam contornos Montserrat 800/450, com licença SIL OFL preservada; não carregam fontes remotas.

Azul base #1600ff, hover #1200cc e superfícies de seleção #e8e6ff. No escuro, ações #6552ff, hover #5644e8 e texto branco; ícones e links de apoio usam azul claro quando necessário para contraste. Logo clara usa texto #191919 e assinatura #52525b; negativa usa branco e #d4d4d8. Os tons de perigo e sucesso e o botão verde de geração continuam semânticos. Cores das curvas SPT e dos materiais geológicos são dados técnicos, não acentos da marca.

Brand usa imagens SVG locais com nome acessível completo. Login 244×86px, menu 144×44px e rodapé 136×48px, com object-fit contain; temas alternam o wordmark mantendo proporções. Ícone e favicon usam o mesmo ativo. Demais tipografias, dimensões e movimentos da interface são preservados.

Novas emissões usam template 0.8.11, acentos e marcadores do croqui azuis e legenda atualizada. O nome da empresa emissora permanece; Metro identifica a plataforma. Templates históricos conservam sua paleta. Login, funções e segredos não foram alterados; novas configurações MFA apenas mostram o novo nome do emissor.

### Identificação opcional da empresa — 03/11/2026

O perfil da empresa pode guardar contatos e logo fornecidos pelo administrador no provisionamento. Quando disponível, a logo PNG aparece antes do título da empresa na área autenticada, com largura máxima de 280px e altura máxima de 76px, proporção preservada, alinhamento à esquerda e 12px até o título. É decorativa para leitores de tela porque o nome completo permanece no h1. Empresas sem logo mantêm o cabeçalho existente. A marca Metro e a navegação permanecem da plataforma; a identidade da empresa não altera cores globais nem as permissões.
