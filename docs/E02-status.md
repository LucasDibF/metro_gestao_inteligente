# E02 — incremento 1: identidade e isolamento (31/10/2026)

## Implementado

Modelos User e Membership, vínculo composto usuário/empresa, perfis ADMIN/ENGINEER/OPERATOR/VIEWER e indicadores de ativação. Email normalizado e único no banco; passwordHash reservado para futura autenticação, sem senha inicial ou cadastro público.

Migrations incrementais preservam a migration inicial e os dados anteriores. Políticas PostgreSQL RLS com FORCE nas empresas e vínculos: leitura exige contexto transacional e vínculo/usuário ativos. Escritas pelo papel da API não são concedidas nesta etapa.

Conexão administrativa separada da conexão da API. Provisionamento local restrito a localhost e ao mesmo banco. A API recusa superusuário, BYPASSRLS ou proprietário das tabelas. Serviço de contexto valida UUIDs e usa parâmetros SQL, sem interpolar identidade em SQL textual.

## Verificações

Três testes unitários de saúde e três testes de integração aprovados. Integração cobre API conectada ao PostgreSQL, persistência/rollback, ausência de contexto, tentativa de leitura de outra empresa, vínculo incorreto, usuário/vínculo inativos, escrita negada e contexto limpo após commit/rollback. O pool de uma conexão força reutilização, inclusive com operações concorrentes. Conexão administrativa na API é rejeitada.

## Próximo incremento

Login, scrypt, JWT, refresh com rotação/revogação e logout implementados no incremento 2. MFA e autorização da administração de sessões foram implementados no incremento 3. Interface de autenticação ainda pendente. Não há endpoints de dados de negócio ou cadastro público. A identidade do serviço transacional só poderá vir de autenticação verificada, nunca de cabeçalhos livres.

A referência técnica das políticas é a [documentação oficial PostgreSQL 17](https://www.postgresql.org/docs/17/ddl-rowsecurity.html). Papéis com superusuário ou BYPASSRLS contornam políticas; por isso os testes usam o papel restrito e a API rejeita privilégios administrativos.

## Incremento 2

Rotas de login, refresh, logout e consulta da identidade; guarda global de autenticação; scrypt com salt; JWT validado com JOSE; sessão persistida com hash do refresh, limite absoluto de sete dias e serialização de rotação/logout. Reutilizar refresh consumido revoga a família. Nenhuma senha/token em texto puro é persistida. Provisionamento local sem credenciais padrão e CI com segredo temporário. Detalhes e limites em [autenticação](authentication.md).

### Evidências do incremento 2

Validação local em 31/10/2026: geração Prisma e migration de sessões aplicadas; tipos dos sete workspaces, scripts e testes aprovados; cinco testes unitários e quatro testes de integração aprovados; build dos sete workspaces aprovado; npm audit sem vulnerabilidades reportadas. Testes incluem logout concorrente com refresh, replay, rotação simultânea, expiração, limite de tentativas, token adulterado e empresa solicitada sem vínculo.

Verificação adicional executou o provisionamento local e o login na API compilada. Tentativa de repetir email falhou sem substituir dados. Contas, empresas e sessões temporárias foram removidas ao final. `.env` permanece ignorado pelo Git. Pipeline remoto ainda não executado e nada foi publicado.

## Incremento 3 — MFA e permissões

MFA TOTP opcional com setup, confirmação e desativação; segredo protegido por AES-256-GCM com chave separada; dez códigos de recuperação de uso único, persistidos por hash; proteção contra replay TOTP sob concorrência; revogação de todas as sessões na mudança de MFA. Login e refresh compartilham o bloqueio de usuário para impedir que uma mudança de MFA deixe sessões antigas utilizáveis.

Guarda global de perfis com vínculo atual do banco. Administração de sessões limitada a ADMIN da própria empresa, com listagem sem tokens/hashes e revogação. Demais perfis recebem 403. Sessão estrangeira e inexistente recebem a mesma resposta 404.

Migration incremental 202610310005_mfa aplicada e permissões locais atualizadas, sem substituir migrations anteriores. Contrato e configuração em [autenticação](authentication.md). UI de login/MFA ainda pendente; permissões de negócio serão acrescentadas com os módulos da E03 em diante. Não há regra de MFA obrigatório por perfil neste incremento.

### Evidências do incremento 3

Em 31/10/2026: cinco testes unitários e cinco testes de integração aprovados; tipos e build dos sete workspaces aprovados; npm audit sem vulnerabilidades reportadas. A integração verifica os quatro perfis, isolamento de sessões entre empresas, alteração de perfil imediata, setup expirado, confirmação MFA, replay TOTP, concorrência de logins com o mesmo código, recuperação de uso único, revogação ao ativar/desativar MFA e ativação concorrente com refresh. Fixtures removidas ao final.

A API compilada inicializou com readiness HTTP 200; setup MFA e administração de sessões sem Bearer retornaram 401. `.env` continua ignorado pelo Git. Segredos e códigos de recuperação não foram publicados ou registrados em documentos. Pipeline remoto ainda não executado.

## Incremento 4 — interface de acesso e MFA

Direção discreta em português confirmada pelo usuário. React com componentes separados para acesso, segurança e cliente HTTP. Login por empresa, segundo fator/recuperação, setup/ativação/desativação MFA, guarda dos códigos e logout conectados à API real. Tokens somente em memória e refresh serializado. Erros de reconfirmação não encerram a sessão; sessão inválida retorna ao acesso.

Interface responsiva verificada em Chrome, desktop de 1440px e celular de 390px. Fonte local Public Sans, estados de espera/erro, rótulos e foco visível. Documentação visual observada em apps/web/DESIGN.md e .impeccable/design.json, reutilizando os agentes existentes de revisão e documentação da habilidade de interface. Nenhum especialista equivalente foi recriado.

Próximo incremento: E03, começando por cadastro e consulta de obras, com autorização e isolamento por empresa. Recuperação assistida de conta, sessões persistentes no navegador e operação em produção não foram incluídas neste incremento. Pipeline remoto continua sem execução; a configuração passa a incluir teste de navegador.

### Evidências do incremento 4

31/10/2026: nove testes unitários, cinco testes de integração e um teste de navegador aprovados; tipos e build dos sete workspaces aprovados; npm audit sem vulnerabilidades reportadas. O Chrome exercitou login, setup/ativação, recuperação de uso único, recarga sem tokens persistidos, rejeição de código reutilizado, desativação MFA e logout. Erro de senha no setup mantém a conta autenticada. Usuários temporários removidos.

Revisão visual dos agentes existentes concluída com disposição ship no escopo aprovado, desktop e celular. Capturas sem credenciais ou segredos. Frontend local na porta 5173 e API na porta 3000 disponibilizados para revisão; nenhum serviço foi publicado. CI remota ainda não executada.
