# Correção do salvamento de dados de campo — 03/11/2026

A leitura terminal parcial usa a profundidade física do encerramento, sem confundir o rótulo do metro com o fim do avanço. Exemplo: linha 5 com 30 golpes em 12 cm encerra em 4,12 m. O cadastro, a edição SPT, a revisão e o checklist agora aceitam esse limite; golpes, penetrações e N-SPT não são recalculados ou extrapolados.

Ao salvar explicitamente a profundidade física, o trecho final de solo que o editor conjunto havia registrado até o limite nominal é encerrado na profundidade informada. Texto, cor, umidade e demais camadas são preservados. O ajuste só é permitido quando a leitura terminal parcial sustenta esse limite; profundidade menor que a medida ou que exclui outros registros continua recusada. Editar o último metro depois do encerramento também respeita o intervalo físico.

As validações de profundidade positiva, limite dos registros, nível d’água e data têm códigos e mensagens específicas em português. Nenhum valor de ensaio é apagado para fazer um salvamento passar.

A migração 202611030002_operator_folder_lock permite o bloqueio transacional da pasta para gravações de campo. Um trigger específico impede mudanças de conteúdo de pastas pelo Sondador sem função adicional autorizada. Mantidos RLS, isolamento entre empresas e bloqueio de campo após envio; a API não concede edição de pastas a OPERATOR.

Validação: 93 testes unitários passaram; integração de permissões/revisão e lixeira passou; regressão sintética de 30/12 → 4,12 m, edição do último metro, fechamento da camada, envio e aprovação passou. Tentativa de 4,11 m foi recusada, assim como renomear pasta pelo Sondador e acessar pasta de outra empresa. Tipos API/web e verificação do diff passaram. Testes utilizaram dados descartáveis em spt_test; o código não preencheu ou alterou automaticamente os furos reais.
