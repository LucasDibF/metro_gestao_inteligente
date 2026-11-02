# E03 — Pastas e furos, incremento 2 (31/10/2026)

## Entrega

Ao abrir uma obra pelo nome, a raiz apresenta suas pastas e somente os furos sem pasta. O nome da pasta abre uma área que mostra somente seus furos, identifica a pasta selecionada e oferece Voltar às pastas. O cadastro de furo dentro dessa área pré-seleciona a pasta aberta. ADMIN e ENGINEER podem criar/renomear pastas e cadastrar/editar furos; OPERATOR e VIEWER consultam. Um furo pode ficar sem pasta ou ser associado a uma pasta da mesma obra. A associação não permite mudar o furo para outra obra ou empresa.

Furo contém identificação, pasta opcional e profundidade planejada opcional. A profundidade executada, golpes, descrição e cálculos pertencem às entregas seguintes. Nenhum cálculo geotécnico foi implementado aqui.

## Contrato HTTP

Bearer obrigatório. Prefixo `/api/v1/obras/:workId`.

| Método e rota                       | Entrada/resultado                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| GET `/pastas?page=1`                | items, total, page, pageSize=20                                                                                    |
| POST `/pastas`                      | name obrigatório; 201                                                                                              |
| PUT `/pastas/:id`                   | name e version esperada; 200                                                                                       |
| GET `/furos?page=1`                 | todos os furos ativos da obra, mantendo compatibilidade quando folderId é omitido; items, total, page, pageSize=20 |
| GET `/furos?page=1&folderId=root`   | somente furos sem pasta                                                                                            |
| GET `/furos?page=1&folderId=<UUID>` | somente furos da pasta ativa indicada, pertencente à mesma obra e empresa                                          |
| POST `/furos`                       | code obrigatório, folderId e plannedDepthM opcionais; 201                                                          |
| PUT `/furos/:id`                    | mesmos dados mais version esperada; 200                                                                            |

`folderId` da consulta aceita `root` ou UUID. Valor malformado retorna 400; pasta inexistente, excluída ou de outra obra/empresa retorna 404. O filtro é aplicado no banco antes de `skip`/`take` e também na contagem de `total`, preservando a paginação correta de 20 itens. A interface sempre envia `folderId=root` na raiz ou o UUID da pasta aberta.

Nome de pasta tem até 120 caracteres, é aparado e único dentro da obra (comparação exata). Identificação de furo é aparada, normalizada para maiúsculas, limitada a 60 caracteres após normalização e única na obra. Identificadores são UUIDs.

plannedDepthM aceita null ou string decimal positiva, até seis dígitos inteiros e duas casas decimais, por exemplo "12.50". O armazenamento é DECIMAL(8,2), sem converter para ponto flutuante na persistência. A interface formata a exibição em metros e português. PUT substitui os dados editáveis: opcionais omitidos ficam null. version é inteiro positivo, inicialmente 1, incrementado atomicamente na edição.

Campo desconhecido, empresa/obra enviados no corpo, profundidade inválida ou versão ausente retornam 400. Perfil sem permissão recebe 403. Obra, pasta ou registro indisponível recebe 404 sem distinguir recurso estrangeiro de inexistente. Duplicação recebe 409 com code DUPLICATE_RECORD; versão desatualizada recebe 409 com code RECORD_VERSION_CONFLICT.

## Integridade e isolamento

Migration incremental 202610310007_folders_boreholes. Chaves estrangeiras compostas vinculam pasta a (obra, empresa) e furo a (obra, empresa) e, quando preenchida, a (pasta, obra, empresa). Isso impede combinações inconsistentes também em escritas diretas, além das validações da API. O banco restringe a profundidade a valor positivo e a identificação à forma normalizada.

RLS e FORCE aplicados às duas tabelas: leitura exige identidade e vínculo ativos da mesma empresa; INSERT/UPDATE também exigem ADMIN ou ENGINEER. Todas as operações da API usam contexto transacional. DELETE não é concedido. Relações usam ON DELETE RESTRICT, preservando os registros vinculados.

Pastas e furos são ordenados por criação e ID, crescentes, em páginas de 20. A interface permite carregar mais pastas explicitamente na raiz e navegar pelas páginas dos furos do contexto atual (sem pasta ou pasta aberta). Abrir ou sair de uma pasta reinicia a paginação de furos na primeira página e fecha os editores. Pastas ainda não carregadas são identificadas como pasta vinculada/atual quando necessário. Recarregar após conflito fecha o formulário e busca a versão atual; dados não salvos são descartados pela ação explícita de recarga.

## Verificação

Nove testes unitários, sete de integração e três de navegador aprovados. Integração inclui duas empresas, associação inválida entre obras/empresas, permissões no papel restrito do banco, profundidades inválidas e precisão decimal, duplicidade, paginação, contexto limpo após transações e duas edições simultâneas do mesmo registro. Chrome valida criação/renomeação de pasta, cadastro/edição de furo, remoção da pasta do furo e retorno à obra, além dos fluxos anteriores. Todas as fixtures temporárias foram removidas.

Desktop e celular revisados no sistema visual existente, incluindo identificação de 60 caracteres sem transbordamento a 390px. Tipos/build aprovados; auditoria sem vulnerabilidades reportadas. Fonte e testes agora usam formatação Prettier consistente, com verificação na CI. Testes de navegador usam frontend compilado, evitando recargas automáticas durante documentação e capturas. CI remota ainda não executada.

## Pendências da E03

Exclusão lógica, lixeira e restauração foram implementadas no incremento 3, documentado em E03-lixeira.md. Não há exclusão física pela API. O filtro de furos por pasta e a navegação por nomes de pasta foram acrescentados na atualização documentada acima. Hierarquia de pastas aninhadas, auditoria histórica e sincronização em tempo real permanecem fora deste incremento.

Cadastro operacional validado localmente com o incremento 3. O motor inicial da E04 está documentado em [E04-motor.md](E04-motor.md); a interface de ensaios passou a ser acessível por cada furo.

## Verificação da navegação por pasta

Atualização local validada por nove testes de integração e seis testes de navegador, conforme execução da implementação. A consulta da API aplica o mesmo filtro ao conteúdo paginado e ao total. A navegação distingue a raiz dos furos da pasta aberta, e o cadastro herda a pasta selecionada. As evidências anteriores desta página permanecem como registro da entrega inicial.

### Apagar furo — 01/11/2026

Ação da lixeira identificada como Apagar furo na listagem, com confirmação que nomeia o registro e restauração pelo administrador. Permissões existentes preservadas: ADMIN executa; ENGINEER vê a opção desabilitada com explicação, sem escalada automática do perfil. Dados técnicos e PDFs históricos permanecem armazenados. Corrigida também a pendência de compilação do tratamento HMR: estado da sessão permanece apenas em memória da página, sem localStorage/sessionStorage.

### Árvore de organização — 01/11/2026

Layout expandido/recolhido baseado no HTML/CSS indicado pelo usuário. Estrutura obra → pasta → furo, incluindo ramo Furos sem pasta. Painel de 320px com conectores, ícones de pasta aberta/fechada e arquivo, seleção visível e transição de 300ms, respeitando redução de movimento. Painel de detalhes mantém cadastro/edição/SPT/lixeira e paginação existentes. Árvore permanece ao trocar de pasta; consultas de furos são sob demanda e paginadas, sem criar subpastas ou alterar vínculos no banco. Renomear e confirmação de lixeira seguem permissões anteriores; nomes longos quebram dentro do painel. Furos abertos de outro ramo atualizam a pasta do caminho de navegação. Ramos fechados ficam fora do foco e da leitura assistiva. Testados teclado, expansão, abertura direta de SPT, pastas vazias, nomes de120caracteres, carregamento adicional, cadastro, renomeação e lixeira. Capturas desktop/celular conferidas.
