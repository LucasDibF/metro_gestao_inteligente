# E19 — Fluxos, segurança e gargalos de acesso

Auditoria de 05/11/2026, feita por leitura de código, seguida das correções abaixo. Capacidade em produção não foi medida.

## Ao aplicar localmente

1. `npm run db:migrate`, para as migrations `202611050001` e `202611050002`.
2. `npm run dev:setup`, porque `set_local_test_role` passou a ser criada só pelo script de desenvolvimento.
3. Atribuir as obras aos sondadores: conta só de sondador vê apenas obras atribuídas.
4. Reiniciar API e worker juntos.

## Regras novas

- Quem tem papel de sondador sem o de engenheiro precisa de atribuição ativa para gravar dados de campo ou enviar para revisão.
- Só engenheiro escolhe coordenada planejada como oficial.
- Editar a coordenada oficial leva o furo aprovado a `IN_REVIEW`, sem reabrir o campo.
- O motivo da devolução permanece visível enquanto o furo estiver em `DRAFT`.
- Retirar o papel de sondador ou desativar o vínculo encerra as atribuições; reativar exige nova atribuição.
- Revisão exige linhas até a parte inteira da profundidade executada: 10,45 m exige os metros 1 a 10.
- `POST /api/v1/auth/password` troca a própria senha e revoga as outras sessões.

## Acesso e carga

- Leituras não usam mais `FOR UPDATE`; só escritas travam a obra. Duas consultas da mesma leitura podem ver estados diferentes.
- Upload mobile valida e grava no armazenamento antes da transação do recibo.
- Pool, espera e `lock_timeout` são configuráveis: `DATABASE_POOL_MAX`, `DATABASE_POOL_MAX_WAIT_MS`, `DATABASE_LOCK_TIMEOUT_MS`. Conflito de trava responde 503.
- Fotos e PDFs têm laços próprios no worker, por isso o limite do contêiner subiu para 2 GiB. Esse valor não foi medido com 40 fotos.

## Produção

- `TRUST_PROXY_HOPS` padrão 2 no Compose: proxy TLS externo mais Nginx. O proxy externo precisa enviar `X-Forwarded-For`; sem isso, os clientes dividem o mesmo limite.
- HSTS fica no proxy que termina o TLS.
- O dono de `invalidate_current_report` precisa ser superusuário ou ter `BYPASSRLS`. Com outro dono, a invalidação afeta 0 linhas, sem erro.

## Pendente de decisão

Bloqueio de conta por tentativas, MFA obrigatório, resposta para e-mail já usado, leitura de dados técnicos por ADMIN e COMERCIAL, retirada de metro para encurtar furo, retenção de dados, coordenada oficial na aprovação, invalidação por dados da obra ou por fotos, tolerância na rotação do refresh, pendências de obra desatribuída no app, cifra do SQLite, identificador e assinatura do app. Também falta definir a saída do sondador em furo com profundidade fracionada: o solo até a fração final só pode ser lançado por engenheiro.
