# E11 — Fluxo do furo, funções e administração local

Registro do incremento em 02/11/2026. Fluxo local; publicação continua adiada. Este documento registra os contratos atuais sem declarar homologação normativa ou assinatura digital com certificado.

## Entrada e seções

A lista tem uma única ação **Abrir furo**. **Editar identificação** fica na Visão geral para ENGINEER. As seções nativas são Visão geral, Registro de campo, Análise geotécnica e Revisão técnica; não há entradas técnicas duplicadas. ADMIN e COMMERCIAL isolados veem somente Visão geral. OPERATOR acessa somente Visão geral e Registro de campo; não recebe Análise geotécnica nem Revisão técnica. ENGINEER acessa análise/revisão e as ações técnicas. VIEWER consulta a análise sem edição e não recebe a seção Revisão técnica. ADMIN e COMMERCIAL isolados não recebem análise.

## Funções e escrita técnica

- ENGINEER — Engenheiro: identificação, planejamento, correção técnica, análise, revisão, devolução, aprovação e emissão. Mantém também cadastro/edição de clientes e obras; não há restrição nova dessas ações ao Comercial exclusivamente.
- OPERATOR — Sondador: SPT, solo e dados de campo enquanto DRAFT; envio com nota e checklist dentro de Registro de campo bloqueia nova escrita até devolução pelo engenheiro. Não tem acesso à análise ou revisão. Não altera identificação ou coordenada planejada.
- COMMERCIAL — Comercial: cadastro/edição de clientes e obras; consulta de relatórios e download quando a configuração permitir, sem edição/emissão técnica.
- ADMIN — Administrador: acessos, lixeira e consulta da empresa; isoladamente não edita técnica, analisa, aprova ou emite.
- VIEWER — Consulta: perfil legado preservado, análise somente leitura e consulta/download conforme configuração da empresa, sem seção de revisão.

`additionalRoles[]` combina funções somente por escolha explícita em Acessos. Não há concessão automática de função técnica a administrador. Correções do ENGINEER em IN_REVIEW ou após aprovação deixam o furo IN_REVIEW; não desbloqueiam o Sondador automaticamente. Aprovação técnica existente continua distinta de assinatura digital com certificado. Este incremento não atribui furos a usuários.

## Limites atuais no servidor

API de análise/folha é restrita a ENGINEER e VIEWER. Camadas manuais e coordenada planejada exigem ENGINEER. Workspace de relatórios aceita ENGINEER, COMMERCIAL, ADMIN e VIEWER, sem OPERATOR isolado; edição, enquadramento e emissão continuam exclusivos de ENGINEER, e download depende da autorização/configuração aplicável. Funções adicionais explícitas são cumulativas: ADMIN + OPERATOR permite campo conforme DRAFT, mas não concede análise, revisão ou emissão de ENGINEER.

## Acessos e clientes

`/api/v1/acessos` oferece GET/POST/PUT. ADMIN cria logins com senha inicial de 12–128 caracteres, atribui funções, ativa/desativa o vínculo na empresa e configura download para funções de consulta. Proteções impedem desativar/perder o próprio acesso administrativo ou remover o último administrador. `membership_events` registra auditoria das mudanças.

`/api/v1/clientes` oferece GET/POST/PUT. O cadastro de clientes é separado; obra preserva contratante textual, sem vínculo automático inventado. Checagens do servidor, RLS e transações/versões sustentam os limites; ocultar ações na interface não substitui autorização.

## Interface e alinhamento

O mundo Estratos permanece. Navegação interna, ações explícitas, campos condicionais e guarda de edição cobrem desktop, móvel e teclado; controles têm pelo menos 44px e a navegação móvel usa duas colunas até 600px. Golpes e método ocupam a faixa geológica de cada metro (1 m em 0–1 m). Valores e pontos usam seu centro; a profundidade marca o limite inferior da faixa. A verificação DOM das bordas e centros aceita diferença máxima de 1px.

Capturas locais do incremento: access-desktop.png, access-mobile.png, clients-desktop.png, field-locked-desktop.png, review-desktop.png e analysis-desktop.png em apps/web/.impeccable/review. A captura móvel final é review-mobile-fresh.png, em página nova no viewport 390 × 844; as capturas antigas com artefatos de composição do navegador não são evidência final.

## Migração e evidência

Migrations `202611020001_workflow_roles` a `202611020006_combined_responsibilities` aplicadas nos bancos local e de testes. Houve backup privado antes da aplicação e as contagens foram preservadas. Não houve alteração de .env, login ou PDF aprovado neste incremento.

Verificação concluída: 71 testes unitários, 16 de integração e 9 de navegador aprovados. Tipos e build verificados. O teste de combinação Administrador + Sondador foi ampliado e passou após a última migração, sem atribuir Engenheiro. Revisão visual final aprovada pelo agente existente, com captura móvel válida. As verificações cobrem autorização por função/composição explícita, bloqueio/devolução de campo, proteção administrativa, versões/RLS, navegação/teclado/móvel e alinhamento DOM.

## Correção de segregação entre campo, análise e revisão

A correção atual preserva a identidade visual e o PDF. Envio com nota/checklist fica no Registro de campo, sem encaminhar Sondador a uma seção de engenharia. O resultado 71/16/9 acima pertence ao fechamento anterior; não constitui evidência de execução final desta correção enquanto seu resultado não for comunicado.

Fechamento da correção: 82 testes unitários, 16 de integração e 9 de navegador aprovados, com tipos/build verificados. A regressão de envio cobre conflito 409 com observações preservadas, navegação bloqueada durante a edição e bloqueio de escrita após envio. Capturas field-submission-desktop.png, field-submission-mobile.png e field-locked-desktop.png verificadas; review-mobile-fresh.png agora aguarda o botão de aprovação antes da captura. A troca local de perfil retorna a Obras e reinicia a área anterior; renderização de Clientes/Relatórios/Lixeira também verifica o perfil. Permissões de consulta não equivalem a poderes técnicos. Não houve mudança de usuários, atribuições, .env ou PDF.
