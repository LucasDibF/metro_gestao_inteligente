# E13 — Criação de obra e posição das ações de campo

Registro do incremento local em 02/11/2026. O usuário esclareceu que os nomes existentes devem permanecer: o ajuste é de posição e fluidez. Identidade Estratos reutilizada; sem nova etapa de aprovação documental. Este registro não declara encerramento final das suítes.

## Obra nova e furos iniciais

Criação aceita `initialBoreholeCount` de 0–200 e `initialFolderName` opcional. Obra, pasta opcional e furos iniciais são criados em uma transação por função SQL restrita, somente para obra nova. Comercial pode iniciar essa estrutura sem receber direitos técnicos nos furos. Sem nome de pasta, furos ficam diretamente na raiz; não há pseudopasta. Não se usa a função para acrescentar ou sobrescrever furos de obra existente.

## Primeiro metro e preenchimento

Novo primeiro metro corresponde a 0–1 m e usa `recordType: INITIAL_SOIL`, resultado `NOT_TESTED`: registra solo e método sem golpes, avanços ou N-SPT. Dados legados do metro 1 não são convertidos ou reescritos. O primeiro solo também aparece no perfil/PDF novo.

Descrição complementar do solo e legenda de foto são opcionais. Repetir tipo e cor do metro anterior é um botão explícito; não copia automaticamente descrição nem deduz solo pelos golpes. Não executado limpa o avanço escolhido e os seguintes, preservando ausência distinta de zero. Último metro do furo registra encerramento sem inventar golpes ou completar avanços ausentes.

## Navegação e guardas

Nomes existentes são mantidos. Navegação superior fica sticky; Identificação é interna ao furo e exclusiva de ENGINEER, sem sair do contexto. Fotografias respeita o perfil de campo. Alterações não salvas em campos e fotos possuem guarda antes de trocar de seção/contexto. Demais limites de papel, bloqueio de campo e devolução explícita pelo engenheiro continuam vigentes.

## PDF e apresentação

Gerar PDF recebe verde próprio com animação de ícone/processamento respeitando redução de movimento. Não altera autorização de emissão. Template novo 0.8.7 estende a grade do gráfico por toda a altura, inclui linhas de método e o primeiro registro de solo. Versões anteriores e PDFs aprovados históricos permanecem preservados. Aprovação técnica não equivale a assinatura digital com certificado; esse recurso não foi acrescentado.

## Verificação final

84 testes unitários, 16 de integração e 9 de navegador aprovados. A correção posterior de identificação/breadcrumb foi verificada novamente nos testes de hierarquia e navegação entre pastas; o teste de responsabilidades também capturou primeiro metro e identificação móvel. Tipos e builds passaram. PDF sintético de quatro páginas passou por preflight, renderização e inspeção visual de todas as páginas. Material sintético não é boletim real nem prova de conformidade normativa global.

Backup privado realizado antes das migrations 202611020007/008; aplicadas em teste e local. Contagens de todos os registros conferidos preservadas após a aplicação. Login, credenciais, funções atribuídas e .env não foram modificados. Serviços locais reiniciados com a versão nova.

Detector visual: os dois avisos de fonte referem-se à Fraunces já aprovada/preservada na identidade; não justificam redesenho neste ajuste. Navegação e formulários foram conferidos em desktop e viewport móvel 390 × 844. A função de criação em lote não amplia permissões de edição técnica do Comercial.
