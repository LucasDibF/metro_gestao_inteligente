# E15 — Login explícito no ambiente local

O bypass local estava pulando a tela de entrada ao abrir o app. A inicialização agora apenas consulta GET /auth/dev-status; não chama POST /auth/dev-session. O formulário normal permanece disponível. Quando DEV_AUTH_BYPASS habilita o recurso, o botão secundário Entrar no ambiente de teste inicia o acesso somente por escolha do usuário.

A consulta de disponibilidade não cria sessão e retorna 404 fora do modo local habilitado. Logout limpa a tentativa de teste para permitir novo acesso explícito. Tokens permanecem somente em memória; não foram alteradas contas, senhas, funções ou .env. A tentativa exploratória de persistência por aba foi retirada ao confirmar que a reclamação se referia à ausência da tela, e não à duração da sessão.

Validação: oito testes unitários de cliente/configuração, fluxo de navegador de login/MFA e fluxo de responsabilidades aprovados. A revisão confirmou a ausência de autenticação automática. Login e botão de teste preservam os componentes visuais existentes.
