# Autenticação — E02, incremento 2

## Contrato HTTP

Todas as rotas usam `/api/v1`. Respostas de autenticação incluem `Cache-Control: no-store`.

| Método e rota | Entrada | Resultado |
| --- | --- | --- |
| POST `/auth/login` | JSON `email`, `password`, `tenantId` e `mfaCode` quando MFA estiver ativo | 200 com `accessToken`, `refreshToken`, `tokenType: Bearer`, `expiresIn: 900` |
| POST `/auth/refresh` | JSON `refreshToken` | 200 com novo par de tokens |
| POST `/auth/logout` | `Authorization: Bearer <accessToken>` | 204, revoga toda a sessão |
| GET `/auth/me` | `Authorization: Bearer <accessToken>` | 200 com `userId`, `tenant: { id, name }` e `role` |

Entradas inválidas retornam 400. Credenciais incorretas, conta desconhecida, usuário/vínculo desativado e sessão inválida retornam 401. Credenciais incorretas e conta desconhecida compartilham a mesma resposta. Limite de 30 requisições por minuto, IP e rota de autenticação; excesso retorna 429. Demais rotas exigem autenticação por padrão, exceto saúde e rotas explicitamente públicas.

O `tenantId` do login é uma solicitação de acesso, validada contra o vínculo ativo no banco. Após login, identidade e empresa vêm exclusivamente do JWT verificado; `x-user-id` e `x-tenant-id` não definem identidade. As consultas de empresa continuam sujeitas às políticas RLS.

## Senhas e tokens

Senhas são derivadas com scrypt assíncrono (N=32768, r=8, p=3), salt aleatório de 16 bytes e chave de 64 bytes. Hashes usam versão `scrypt-v1`; comparação usa `timingSafeEqual`. Provisionamento exige ao menos 12 caracteres e limita a entrada a 1024 bytes. Não há senha padrão nem cadastro público.

JWT assinado por HS256, com duração de 15 minutos, issuer/audience `spt-api`, identidade do usuário, empresa e ID da família da sessão. A API exige `JWT_SECRET` privado com ao menos 32 bytes. Algoritmo, assinatura, issuer, audience, datas e formato dos IDs são verificados. Cada requisição também consulta a sessão e o vínculo ativo, permitindo revogação imediata para novas requisições.

Refresh tokens têm 32 bytes aleatórios, são opacos e persistidos somente por SHA-256. Cada renovação consome o token anterior e cria outro. A família tem duração absoluta de sete dias, sem extensão pela renovação. O histórico consumido é mantido para detectar replay. Reutilização de token consumido revoga a família, inclusive o sucessor. Renovações e logout usam o mesmo bloqueio transacional por família; duas renovações simultâneas levam à revogação por replay. O cliente deve serializar a renovação e descartar os tokens ao receber 401.

As tabelas de identidade (`users`, `auth_sessions`) são globais e internas à autenticação. O papel da API pode ler usuários e ler/inserir/atualizar sessões, sem DELETE ou privilégios administrativos. Empresas e vínculos mantêm RLS. Não há endpoints para consultar sessões de outro usuário.

## Uso local

1. Configure as duas URLs do banco conforme `.env.example`, aplique migrations e execute `npm run db:setup:local`.
2. Gere um segredo com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` e preencha `JWT_SECRET` no `.env`, nunca em arquivos versionados. A configuração local desta execução já contém um segredo gerado.
3. Defina `LOCAL_USER_EMAIL`, `LOCAL_USER_PASSWORD` e `LOCAL_TENANT_NAME` no ambiente privado e execute `npm run user:create:local`. A senha não é registrada pelo comando. Evite colocá-la no histórico do terminal. O comando cria uma empresa e seu administrador e informa apenas o ID da empresa; email duplicado falha sem substituir dados.
4. Inicie a API e utilize o ID informado no login. O script de criação é restrito a banco local, usa a conexão de migrations e não é parte do processo HTTP.

A interface de login e MFA está disponível no incremento 4. A CI gera seu próprio segredo temporário, prepara o papel restrito e executa os testes sem credenciais de produção.

## Limites da entrega

MFA e autorização por perfil para administração de sessões foram implementados no incremento 3, detalhado abaixo. Ainda não há operações de negócio expostas. Limitação de tentativas usa memória por instância; coordenação entre réplicas, distribuição/rotação das chaves, recuperação de conta e limpeza periódica das sessões históricas permanecem pendentes antes da operação em produção. Nenhum monitor ou job de limpeza foi criado.

Implementação apoiada na [documentação de autenticação do NestJS](https://docs.nestjs.com/security/authentication), na [API scrypt do Node.js](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback) e no [JOSE](https://github.com/panva/jose).

## MFA — incremento 3

MFA TOTP é opcional por usuário neste incremento e compatível com aplicativos autenticadores (6 dígitos, período de 30 segundos, tolerância de um período). Após ativação, `POST /auth/login` exige, além da senha e empresa, `mfaCode`: código TOTP ou um código de recuperação. Sem o segundo fator correto, não é criada uma sessão. O campo `mfaEnabled` de `GET /auth/me` informa o estado, sem expor segredos.

| Método e rota | Entrada autenticada | Resultado |
| --- | --- | --- |
| POST `/auth/mfa/setup` | `password` | 200: `secret`, URI `otpauth` e `expiresIn: 300` |
| POST `/auth/mfa/enable` | `password`, `code` TOTP | 200: dez `recoveryCodes`, exibidos uma única vez; revoga todas as sessões do usuário |
| POST `/auth/mfa/disable` | `password`, `code` TOTP ou recuperação | 204: remove o segundo fator e revoga todas as sessões do usuário |

Todas essas rotas exigem Bearer válido, reconfirmação da senha e respondem sem cache. Limite de dez requisições por minuto, IP e rota. Configuração expirada exige novo setup. Uma configuração ativa não pode ser substituída por setup.

O código TOTP usado para confirmação também é consumido: aguarde o próximo código do autenticador para entrar novamente ou utilize um código de recuperação. Passos TOTP já utilizados são rejeitados, inclusive em tentativas concorrentes. A chave TOTP é persistida somente cifrada com AES-256-GCM, IV aleatório e identidade do usuário vinculada como dado autenticado. Os dez códigos de recuperação têm 128 bits aleatórios cada e somente seus hashes SHA-256 são persistidos. Cada código de recuperação é consumido uma vez.

Configure `MFA_ENCRYPTION_KEY` no `.env` com 32 bytes aleatórios em hexadecimal (64 caracteres), separadamente de `JWT_SECRET`. A API exige ambas as chaves. Use o mesmo gerador criptográfico descrito acima. Guarde a chave de criptografia: ela deve permanecer estável entre reinicializações para decifrar as configurações existentes. A execução local deste incremento já gerou uma chave separada. A CI gera chaves temporárias somente para seus próprios dados de teste.

Ativação, desativação, consumo de códigos, login e refresh são coordenados por bloqueio transacional por usuário. Ativar MFA revoga inclusive sessões renovadas concorrentemente e também as sessões do usuário em outras empresas. O usuário deve autenticar-se novamente.

## Permissões e administração de sessões

O perfil é lido do vínculo ativo no banco em cada requisição; não é aceito dos cabeçalhos ou de claims de perfil do cliente.

| Operação | ADMIN | ENGINEER / OPERATOR / VIEWER |
| --- | --- | --- |
| Consultar identidade e gerenciar próprio MFA | Permitido | Permitido |
| GET `/auth/tenant-sessions` | Permitido na própria empresa | 403 |
| POST `/auth/tenant-sessions/:sessionId/revoke` | Permitido na própria empresa | 403 |

A listagem retorna até cem sessões atuais, ordenadas por criação, somente com `familyId`, `userId`, `createdAt` e `expiresAt`. Não retorna hashes nem tokens. Para revogar, use `familyId` como `sessionId` na rota. Sessão inexistente ou de outra empresa retorna 404 com a mesma mensagem. Revogação retorna 204 e bloqueia novos acessos e refresh daquela família.

A guarda de perfis está disponível para os próximos módulos, mas as permissões de obras, ensaios e aprovação serão definidas e testadas nas entregas correspondentes. MFA ainda não é imposto obrigatoriamente por perfil. Recuperação assistida de conta sem autenticador/códigos e rotação da chave de criptografia exigem fluxos futuros; nenhuma rotina administrativa de reset foi improvisada.

Biblioteca TOTP: [otplib, documentação oficial](https://github.com/yeojz/otplib).

## Interface web — incremento 4

A aplicação React permite entrar por email/senha/empresa, informar o segundo fator ou recuperação, consultar a empresa e o perfil e configurar, confirmar ou desativar MFA. Os códigos de recuperação são apresentados após a confirmação, com orientação de salvamento e confirmação antes de voltar ao login. Não há cadastro público nem funcionalidades de obras nesta interface.

Os tokens ficam exclusivamente em memória: não são gravados em localStorage, sessionStorage ou cookies. Recarregar a página exige login novamente; as sessões do servidor continuam sujeitas à expiração/revogação descritas acima. Não há a opção de manter conectado nesta entrega. A renovação é serializada no cliente, e respostas tardias não restauram uma sessão encerrada.

Erros de reconfirmação de senha/código nas rotas de MFA retornam 401 com `code: MFA_VERIFICATION_FAILED`. O cliente apresenta o erro sem renovar ou descartar a sessão. No login, a resposta permanece genérica para credenciais inválidas. Quando a sessão realmente expira ou é revogada, a interface volta ao acesso.

Para uso local, execute a API em uma janela (`npm run dev:api`) e o frontend em outra (`npm run dev:web`), abrindo http://localhost:5173. O Vite encaminha `/api` à API local na porta 3000; `SPT_API_TARGET` permite indicar outro destino no ambiente de desenvolvimento. Publicação futura deve manter `/api/v1` no mesmo domínio por proxy; nenhum deploy foi realizado.

A fonte Public Sans é servida pelo próprio aplicativo. Os testes de navegador usam Chrome instalado no macOS e Chromium no Linux/CI. Após build e preparação do banco, execute `npm run test:browser`. Na primeira execução em Linux, instale o navegador com `npx playwright install --with-deps chromium`. A CI inclui essa preparação.
