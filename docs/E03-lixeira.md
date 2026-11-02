# E03 — Lixeira e restauração (31/10/2026)

Implementada exclusão lógica de obras, pastas e furos, restrita a ADMIN. Nenhum DELETE físico é concedido ao papel da API. Confirmação inline precede o envio à lixeira; a restauração ocorre na área administrativa Lixeira.

## Contrato

Prefixo /api/v1, Bearer obrigatório. Todas as mutações recebem apenas version inteiro positivo no JSON.

- DELETE /obras/:id
- DELETE /obras/:workId/pastas/:id
- DELETE /obras/:workId/furos/:id
- POST /lixeira/:tipo/:id/restaurar, tipo obras, pastas ou furos
- GET /lixeira?tipo=obras&page=1, páginas de 20 itens

Mutações retornam 200 com id e nova versão. Entrada inválida retorna 400; perfil não autorizado, 403; recurso inexistente ou estrangeiro, 404; versão/estado conflitante, 409. ACTIVE_CHILDREN indica filhos ativos; PARENT_IN_TRASH exige restaurar o pai; RECORD_VERSION_CONFLICT exige recarregar.

## Regras

Obra com pastas ou furos ativos não pode ser excluída. Pasta com furos ativos também não. Não há cascata. Filhos devem ir à lixeira antes dos pais; restauração exige primeiro obra e pasta ativas. Restaurar um pai não restaura seus filhos automaticamente.

Identificações de furos e nomes de pastas permanecem reservados, inclusive na lixeira. Restaurar preserva IDs, vínculos e dados. Edição comum de item excluído é bloqueada. Não há expurgo automático ou físico.

Listagens e consultas operacionais excluem tombstones. A lixeira mantém isolamento por empresa e exige ADMIN. RLS oculta registros excluídos dos demais perfis, inclusive em consultas diretas. Gatilhos restringem alterações do estado de exclusão a administradores e impedem filhos ativos sob pais excluídos. Ações de escrita são serializadas pela obra e verificam versões; criação/edição concorrente não deixa filhos ativos órfãos.

Enquanto na lixeira, deletedAt e deletedBy registram data e identidade da exclusão. A identidade é obtida do contexto autenticado e fixada pelo banco. Restaurar limpa esses marcadores. Isso não constitui histórico de auditoria imutável: trilha histórica de eventos e políticas de retenção permanecem fora desta entrega.

Migrations 202610310008_trash e 202610310009_trash_trigger_guards preservam as anteriores e adicionam colunas, índices, políticas e gatilhos. A segunda corrige a função compartilhada de proteção detectada nos testes. Superusuários administrativos de manutenção não são o papel usado pela API.

## Evidências locais

Nove testes unitários, oito de integração e quatro de navegador aprovados. Tipos, build e formatação aprovados; npm audit sem vulnerabilidades reportadas. Cobertos: autorização, isolamento entre empresas, identidade da exclusão, ausência de exclusão física, pais indisponíveis, reserva de identificadores, duas restaurações simultâneas e corridas entre criação, edição e exclusão.

Chrome validou cancelar confirmação, bloquear pai com filhos, excluir filho/pasta/obra, restaurar na ordem correta e impedir controles administrativos ao perfil de consulta. Capturas desktop/mobile válidas, incluindo identificador de 60 caracteres com novas ações. Revisor não encontrou problemas materiais na interface; atualização do registro de produto foi conferida pelo agente documentador e pelo agente principal. O fechamento final do revisor foi impedido por limite de uso, portanto não se registra aprovação final adicional desse agente.

## Fechamento local

E03 funcional validada localmente: obras, pastas, furos, edição versionada, lixeira/restauração, autorização e isolamento. CI remota não executada; nada publicado. Auditoria histórica, funcionalidades geotécnicas e preparação de produção permanecem nas próximas entregas. Próxima etapa: E04 — lançamento SPT e motor geotécnico isolado, com casos de referência validados.
