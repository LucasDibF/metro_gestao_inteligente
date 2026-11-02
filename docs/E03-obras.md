# E03 — Obras, incremento 1 (31/10/2026)

## Implementado

Cadastro, listagem paginada, busca por nome/contratante, consulta e edição de obras. Módulo NestJS separado em entrada, serviço e controller; modelo Prisma Work com empresa, identificação, dados opcionais e versão. Interface React integrada na aba Obras; Segurança da conta permanece acessível.

Nome é obrigatório (até 200 caracteres). Contratante (200), município (120), UF brasileira válida e endereço (500) são opcionais. Campos vazios são normalizados para null; UF é convertida para maiúsculas. A empresa vem exclusivamente da identidade autenticada; campos desconhecidos, inclusive tenantId, são rejeitados.

## Contrato

Prefixo `/api/v1`, Bearer obrigatório.

| Método/rota | Operação | Perfis |
| --- | --- | --- |
| GET `/obras?page=1&q=texto` | Lista de 20 itens, total, page, pageSize | Todos os perfis ativos |
| GET `/obras/:id` | Consulta individual | Todos os perfis ativos |
| POST `/obras` | Cadastro; 201 | ADMIN, ENGINEER |
| PUT `/obras/:id` | Substituição dos dados editáveis com version esperado; 200 | ADMIN, ENGINEER |

POST aceita name, clientName, city, state, address. PUT aceita os mesmos campos mais version inteiro positivo. O resultado inclui id, tenantId, dados, version, createdAt e updatedAt. A versão inicial é 1 e aumenta em cada edição. A lista é ordenada por criação e ID, ambos decrescentes. page aceita inteiros de 1 a 100000; q tem até 100 caracteres. q vazio consulta sem filtro.

Versão desatualizada retorna 409 com code WORK_VERSION_CONFLICT; a interface preserva o formulário e permite recarregar os dados antes de nova gravação. Essa ação descarta a cópia local em favor da versão atual. Recurso inexistente ou de outra empresa retorna 404 com a mesma resposta. Falta de permissão retorna 403. Entrada inválida retorna 400.

## Isolamento

Todas as operações passam por TenantDatabaseService na mesma transação que define contexto local. PostgreSQL aplica RLS e FORCE na tabela works. Leitura exige empresa correta e usuário/vínculo ativos; INSERT/UPDATE também exigem ADMIN ou ENGINEER. O papel da API não possui DELETE. A API verifica perfis antes de executar e mantém tenantId nos filtros. Nenhum endpoint permite mover obra entre empresas.

A edição usa UPDATE com id, tenantId e version esperada, incrementando a versão atomicamente. Duas gravações da mesma versão não produzem sobrescrita silenciosa: uma passa e a outra recebe conflito.

Referência: [políticas RLS PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

## Evidências locais

Migration incremental 202610310006_works aplicada e cliente Prisma gerado; dados anteriores preservados. Nove testes unitários, seis de integração e dois de navegador aprovados. Tipos e build aprovados. Integração testou duas empresas e quatro perfis, acesso direto pelo papel restrito do banco, tentativa de inserir em empresa estrangeira, escrita por consulta negada, vínculo desativado, contexto limpo no pool, paginação/busca e conflito entre duas edições concorrentes. Chrome validou cadastro, busca, edição e consulta sem controles de gravação; fluxo de login/MFA também passou. Fixtures removidas ao final.

## Limites e continuidade

Este é o primeiro incremento da E03, ainda não a entrega completa. Exclusão/lixeira implementada no incremento 3; pastas e furos implementados no incremento 2, descrito em E03-pastas-furos.md. A busca não é pesquisa geográfica. O fluxo não garante idempotência de cadastro após uma falha de rede; não há retry automático de erros de rede. Auditoria histórica e atualização em tempo real não estão incluídas.

Pastas e furos concluídos no incremento 2; lixeira e restauração concluídas no incremento 3. Nenhum deploy ou pipeline remoto executado.
