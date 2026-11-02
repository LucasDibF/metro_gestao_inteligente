# E06 — Fotografias privadas e coordenadas

Código local observado em 31/10/2026. Armazenamento real compatível com S3 é acessado por adaptador `@spt/private-storage`; desenvolvimento usa MinIO do Compose e bucket com versionamento. Não há bucket/provedor de produção homologado.

## Contrato atual

Prefixo autenticado `/api/v1/obras/:workId/furos/:boreholeId/arquivos`. Todos os perfis consultam recursos da própria empresa; ADMIN/ENGINEER alteram.

| Método e rota                   | Entrada/resultado                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| GET                             | versão técnica, referência oficial, coordenadas e até 100 fotos ativas, sem chaves internas dos objetos |
| PUT `/coordenadas/planejada`    | coordenada UTM; `version` exigida na edição                                                             |
| PUT `/coordenadas/executada`    | mesmo contrato                                                                                          |
| PUT `/coordenadas/oficial`      | `coordinateId` existente no furo e `technicalVersion` esperada                                          |
| POST `/fotografias`             | multipart com um `file` e `caption` obrigatória; devolve ID/versão                                      |
| PUT `/fotografias/:id`          | `version`, `caption`, `crop: {x,y,width,height}`                                                        |
| DELETE `/fotografias/:id`       | `version`; remoção lógica da seleção atual                                                              |
| GET `/fotografias/:id/original` | original privado, após autorização e estado READY                                                       |
| GET `/fotografias/:id/preview`  | miniatura JPEG privada, somente após READY                                                              |

Este é o contrato implementado, com upload passando pela API; não há upload direto por URL assinada nem fluxo separado de confirmação nesta versão. Downloads são servidos pela API com `private, no-store` e `nosniff`.

## Imagens e preservação

Uma foto tem até 8MiB, 25 milhões de pixels e um quadro JPEG ou PNG decodificável. O tipo é verificado por decodificação, não pelo nome do arquivo ou MIME informado. Miniatura respeita orientação, cabe em 1200×1200 sem ampliar e usa JPEG de qualidade 85. As operações Sharp de decodificação/transformação têm limite de entrada e timeout configurado de cinco segundos.

O original mantém seus bytes e hash SHA-256; legenda e recorte ficam separados no banco. Recorte usa frações entre zero e um, com largura/altura positivas e retângulo dentro da imagem. A UI recebe porcentagens e converte. Miniatura de conferência não é regravada a cada recorte; o worker aplica o recorte ao PDF a partir do original congelado. Remoção lógica não apaga o objeto histórico. Não há expurgo físico por esse endpoint.

Extração de GPS EXIF é opcional; foto sem GPS continua utilizável. Falha de EXIF não substitui a validação da imagem nem bloqueia uma foto já decodificada. A API faz validação inicial de tamanho/metadados, grava o original privado e cria o registro PENDING. Decodificação/miniatura e extração GPS são executadas por `photo-worker.ts`, no processo separado que também consome relatórios. Até READY, o original está em quarentena lógica: download não é liberado e a foto não entra nas opções/composição da emissão. A API ainda realiza a leitura de metadados Sharp inicial, não todo o processamento.

Estados de foto: PENDING, PROCESSING, READY, FAILED. Claim usa `SKIP LOCKED`, token de lease por 60 segundos e até três tentativas. Falha transitória aguarda dez segundos; permanente/esgotamento fica FAILED. Finalização/falha exige token/lease vigente. O worker valida escopo/hash do original, gera e relê a miniatura antes de finalizar. GPS só é gravado na transição PROCESSING→READY; ausência de GPS não invalida a imagem. O worker atual de foto não tem heartbeat próprio: um trabalho que exceda seu lease deve ser retomado e não pode finalizar com token expirado.

Compose de produção declara limites de memória/CPU do worker, mas ainda não houve execução de produção ou teste de carga dessa configuração. Timeout de biblioteca e limite de pixels não comprovam sozinhos isolamento operacional completo.

## Coordenadas e conferência GPS

Campos: `eastingM`, `northingM`, `zone`, `hemisphere`, `datum`, `altitudeM`, `reference` e versão na edição. Valores métricos são strings decimais com até duas casas. UTM aceita este entre 100000–900000m, norte entre 0–10000000m, fusos 1–60, hemisférios N/S, somente SIRGAS2000 neste contrato. Altitude opcional entre -500 e 9000m; referência de origem obrigatória, até 500 caracteres. A transformação também verifica domínio UTM/hemisfério.

A referência oficial aponta para uma coordenada planejada/executada existente, sem criar cópia solta. Selecioná-la ou alterar os dados da coordenada oficial invalida aprovação técnica na transação. GPS de foto nunca altera automaticamente essa referência.

A distância é uma aproximação plana após converter WGS84/UTM com PROJ4, elipsoide GRS80 e deslocamento geocêntrico nulo. Não é alegada transformação de precisão geodésica, de época ou centimétrica. A interface identifica a distância como aproximada. O alerta interno usa estritamente `distance > 10`; igualdade a 10 não alerta. O aviso não integra o PDF.

A listagem é limitada a 100 fotos ativas por furo, também o limite de cadastro atual. A interface informa processamento/falha e permite recarregar; uma foto FAILED deve ser removida e reenviada. Não há retry manual separado na API.

## Setup e testes

Configure `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` e `S3_SECRET_ACCESS_KEY`; execute `docker compose up -d` e `npm run storage:setup:local`. O script é restrito a endpoint local fora de produção e cria/reutiliza o bucket com versionamento. Console MinIO local: porta 59001; objetos/API: 59000. Em produção, o adaptador exige HTTPS no endpoint configurado e credenciais restritas.

O teste `tests/integration/files.test.ts` usa armazenamento real local, imagens válidas/inválidas, preservação dos originais, perfis e empresas, recorte e invalidação por coordenadas. Após acrescentar a fila de imagens e ajustar sua integridade/ordem de bloqueios, a execução conjunta teve 12 testes de integração aprovados. Tipos e 23 testes unitários também passaram. Seis testes de navegador anteriores cobriram o fluxo completo; a suíte final comunicada passou em 26 testes unitários, 12 de integração e seis de navegador, com o fluxo assíncrono de fotos. Esta tarefa documental não reexecutou a suíte.

## Limites da etapa

O croqui disponível na emissão é técnico em fundo claro, sem satélite/ruas ou provedor de mapas; escala/enquadramento começam automáticos e podem ser ajustados por centro/abrangência versionados, congelados na emissão; ver E07-relatorios-emissoes.md. Não há editor cartográfico de terceiros, basemap licenciado ou validação geodésica de precisão. Esses serviços externos não são necessários ao objetivo atual de testar localmente o croqui técnico. Versionamento S3 não é política WORM/Object Lock: retenção, recuperação, IAM e proteção externa contra sobrescrita precisam ser definidos para produção.
