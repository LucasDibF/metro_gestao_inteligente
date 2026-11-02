# E10 — Análise interativa do furo

## Acesso e comportamento

Obra → Furo → Ensaios SPT → **Análise do furo**. Consulta dados atuais, inclusive sem aprovação. Não cria emissão, não salva dados ao selecionar e não altera o PDF aprovado.

Perfil nativo HTML/SVG com cinco colunas: profundidade, camadas geológicas, três avanços, gráfico de resistência e método. Escala comum de 64 px/m; trechos de até 20 m, zoom e ajuste à largura. Camadas podem ser consultadas integralmente no painel; representação hachurada não afirma mineralogia/cor real. Curvas azul/vermelho usam resultados convencionais: dados parciais, interrompidos ou metros ausentes não são interpolados. Seleção de camada destaca intervalo e leituras; clique/Enter em ponto ou metro abre detalhes. Leitura terminal parcial tem faixa própria abaixo do último metro para evitar sobreposição. NA é posicionado pela profundidade registrada.

Painel mostra avanços brutos, somatórios, resultado, método, recuperação, observações, solos e fotos privadas carregadas sob demanda. Escrita abre formulários existentes e mantém controle de versão. VIEWER consulta sem escrita. Em telas até 1200 px há abas perfil/detalhes. Animação de entrada das curvas respeita redução de movimento.

## Dados e limitações

GET `/api/v1/obras/:workId/furos/:boreholeId/tecnico/analise`: autenticação, escopo por empresa e Cache-Control privado sem armazenamento. Retorna dados, avisos e encerramento calculado pelo motor compartilhado, sem gerar HTML do boletim, PDF ou jobs. A antiga rota `/folha` continua disponível para compatibilidade. Limites: 1000 m, 1000 testes/camadas combinados, 100 fotografias.

Lavagem por tempo ainda não tem campo no cadastro; a página mostra explicitamente ausência. Circulação de água não é interpretada como medição de lavagem. Data/profundidade/coordenada/resultado ausentes não equivalem a zero. Sem profundidade declarada, alcance visual dos registros é acompanhado de aviso.

## Verificação

Testes do modelo verificam somatórios, zero, exclusão de resultados parciais/interrompidos, escala horizontal e encerramento físico. Integração verifica consulta por VIEWER, isolamento entre empresas, ausência de HTML e preservação da versão. Navegador usa furo sintético com três camadas, dois métodos, NA 3,2 m e leitura terminal 30/14 em 6,14 m; verifica teclado, seleção sincronizada, filtros de curvas, mobile e redução de movimento. Capturas em apps/web/.impeccable/review/analysis-desktop.png e analysis-mobile.png.


## Alinhamento com as camadas

Cada registro ocupa a faixa geológica do metro: 1 m em 0–1 m; 2 m em 1–2 m. Linhas de golpes e método têm as mesmas bordas da faixa; os pontos ficam no seu centro. Marcas de profundidade permanecem no limite inferior de cada faixa; NA e encerramento mantêm sua posição física. Isso remove o deslocamento de meio metro sem alterar os valores ou o PDF. Testes verificam bordas, centros e continuação a partir de 20 m. Capturas: analysis-band-desktop.png, analysis-band-mobile.png e analysis-band-dark.png.
