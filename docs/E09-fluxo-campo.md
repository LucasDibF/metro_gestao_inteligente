# E09 — Organização de campo e conferência

Incremento autorizado em 01/11/2026 a partir do frontend de referência sondagem. Mantidos login, permissões, lixeira, revisão técnica e desenho da folha PDF aprovada.

## Entregas

- SPT: reabertura explícita por profundidade, lista de metros salvos, abertura do próximo metro existente sem criar duplicata e salvamento atômico de golpes, solo e detalhes de campo. Durante a edição, o caminho de navegação não descarta o formulário.
- Solo por intervalo: cor livre com sugestões e umidade opcional Seca/Úmida/Saturada, além do tipo e descrição existentes. Campos antigos permanecem nulos; vizinhos preservam os metadados ao dividir intervalos.
- Detalhes do ensaio: método opcional TC/TH/SP_TH/CA/SP_CA e recuperação INTEGRA/PARCIAL/NENHUMA. Valores desconhecidos são rejeitados; o cálculo continua exclusivamente no motor.
- Conferência do furo: separa pendências para revisão, exigências de emissão e recomendação de fotografias. Não acrescenta fotos obrigatórias nem altera as regras de aprovação.
- Perfil na interface: camadas informadas, pontos de N-SPT definitivos e tabela acessível. Não extrapola registros especiais para zero, não infere classificação e permite rolagem horizontal no celular.
- Fotos: finalidade Local/Execução/Amostra 1/Amostra 2/Outras, contagem por finalidade e edição junto da legenda/recorte. Originais e versões existentes preservados.
- Obras: contagem total, sem furos, preparação/campo, aguardando revisão e furos aprovados. Estados são derivados dos furos ativos; não existe status fictício ou conclusão automática de obra.
- Central de relatórios: busca por título, obra e contratante, filtro da emissão mais recente, paginação de 20 itens, download privado e abertura dos relatórios da obra.
- Caminho de navegação: obra, pasta e furo; atalhos mantêm contexto.
- Notificações: até 50 eventos recentes reais de envio/aprovação/devolução e PDF pronto/falho. Leitura individual por usuário, marcar todas, abertura do registro e atualização a cada 30 segundos quando a aba está visível, ao abrir e por ação manual.

## Persistência e segurança

Migrações aditivas 202611010001_field_workflow e 202611010002_workspace_activity_indexes aplicadas aos bancos locais spt e spt_test. Novos campos opcionais: spt_tests.field_details, soil_layers.soil_color/soil_moisture e borehole_photos.purpose. NotificationRead tem chaves por empresa/usuário/evento, vínculos em cascata e RLS que impede consultar ou marcar leituras de outro usuário/empresa. Eventos técnicos e emissões continuam imutáveis.

## Contratos adicionais

- GET /obras/:workId/furos/:id/ensaios/metro?depth=1 retorna {record:null} para metro ainda não registrado; não cria dados durante consulta.
- Listagem de ensaios inclui navegação por profundidade.
- POST/PUT do ensaio aceita fieldDetails; soil aceita soilColor e soilMoisture opcionais.
- Fotografias aceitam purpose na inclusão e edição.
- GET /workspace/resumo — contagens reais.
- GET /workspace/relatorios?page=1&q=&state= — central paginada.
- GET /workspace/atividades e POST /workspace/atividades/lidas com {keys:[]} — leitura por usuário.
- GET /obras aceita status NOT_STARTED/IN_FIELD/IN_REVIEW/APPROVED.
- Dados técnicos incluem tests e checklist para conferência.

## PDF

Modelo 0.8.1 mantém geometria, traços e regras aprovados. Novos snapshots incorporam cor/umidade à descrição e imprimem o método informado na coluna já existente. Registros sem método continuam NI. O worker aceita 0.8.0 e versões anteriores já suportadas; snapshots anteriores não recebem o método novo retroativamente. Recuperação fica disponível no registro de campo e snapshot, sem criar coluna ou alterar a folha.

## Verificação

64 testes unitários, 15 testes de integração e 7 fluxos de navegador aprovados. Cobertos: validação de opções, zero medido, persistência após reabrir, salvamento conjunto, versões concorrentes, preservação de vizinhos, finalidade da fotografia, checklist, busca/filtros, isolamento por empresa/usuário e abertura de notificações. Tipos e compilação aprovados. PDF de teste com 3 páginas renderizado com Poppler e conferido visualmente; método SP+TH legível, margens e tabelas preservadas. Capturas de formulário, checklist, perfil, central e notificações em desktop/celular inspecionadas.

## Limites deliberados

Não foram criados cadastros de clientes, equipes ou equipamentos: foram indicados como trabalho posterior na proposta. A prévia do perfil é conferência dos dados, não laudo nem classificação automática. Notificações são internas; não enviam email ou mensagens externas. Continuamos somente em ambiente local.
