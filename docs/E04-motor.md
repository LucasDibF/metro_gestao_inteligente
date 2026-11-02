# E04 — Motor geotécnico, incremento 1 (31/10/2026)

## Escopo implementado

Pacote @spt/geotechnical-engine independente de NestJS, React, Prisma, banco, rede e gerador de relatórios. Função pura evaluateSpt(input), versão de cálculo 0.1.0. Nenhuma nova dependência de execução ou migration.

O caso convencional do projeto é calculado quando existem exatamente três avanços, todos de 150 mm e com golpes inteiros positivos. N-SPT é a soma dos golpes do segundo e terceiro avanços. Caso de referência da especificação ARQ-006: 4/6/8 golpes, cada avanço de 15 cm, resulta em 14.

Esse cálculo aritmético não aprova tecnicamente um ensaio nem verifica todos os critérios de execução/paralisação. Não se declara conformidade normativa completa. Não foram implementadas regras especiais com base em suposições ou cópias não oficiais da norma.

## Entrada e resultado

Entrada: advances, lista de zero a três objetos com blows e penetrationMm, ambos inteiros seguros não negativos. A penetração usa milímetros inteiros para evitar comparação fracionária. interruptionReason pode ser omitido, null ou texto não vazio de até 500 caracteres, referente ao ensaio avaliado.

Campos desconhecidos e estruturas inválidas são rejeitados. Strings numéricas não são convertidas automaticamente. NaN, infinito, negativos, frações, arrays esparsos e somas fora da precisão inteira segura são inválidos.

Estados:

- CONVENTIONAL: três avanços de 150 mm e golpes positivos; nSpt numérico.
- INCOMPLETE: menos de três avanços; nSpt null.
- INTERRUPTED: interrupção registrada, mesmo com três avanços preenchidos; nSpt null.
- REQUIRES_REVIEW: penetração diferente de 150 mm ou golpes iguais a zero; nSpt null.
- INVALID: entrada incompatível ou aritmética insegura; nSpt null e issues com caminho/código de validação.

Para entradas válidas, resultado mantém os avanços, motivo de interrupção, penetração total e engineVersion. O motor copia e congela os dados de saída, não altera a entrada e não reutiliza resultados anteriores após mudanças. Não há interpolação, extrapolação, classificação automática de solo, equivalência de penetração parcial ou inferência de queda por peso próprio.

## Evidências

Dez testes novos do motor: referência 4/6/8, exclusão do primeiro avanço da soma convencional, ensaios incompletos, penetrações especiais, interrupção, zero golpes, validação numérica/estrutural, precisão segura e imutabilidade/recálculo. Vinte testes unitários do projeto passaram no total. Tipos e build dos sete workspaces aprovados. O artefato compilado também foi carregado e verificado com o caso de referência.

## Continuidade

Esse era o limite do incremento inicial do motor. Os incrementos seguintes já adicionaram formulário, endpoints e persistência de ensaios, dados de campo e camadas, descritos em [E04 — ensaios e dados](E04-ensaios-dados.md), além de [revisão técnica](E05-revisao.md), [arquivos/coordenadas](E06-arquivos-coordenadas.md) e [PDF de homologação](E07-relatorios-emissoes.md). Regras especiais e classificação de solos exigem casos técnicos de referência validados antes de serem liberadas.
