# E12 — Estado do solo por N-SPT

Incremento local de classificação, sem alteração de migrations, .env ou credenciais. Regra isolada em `packages/geotechnical-engine/src/soil-classification.ts`: `NBR6484-2020-A1-v1`. O tipo predominante é informado pelo usuário; N-SPT não identifica o tipo de solo.

## Entradas e faixas

Exige resultado CONVENTIONAL e N-SPT inteiro seguro não negativo. Areia e silte arenoso pertencem ao grupo granular (Compacidade); argila e silte argiloso ao coesivo (Consistência). Argila arenosa continua coesiva; areia argilosa continua granular. Silte sem qualificativo, tipo desconhecido/ambíguo e resultado incompleto/interrompido/especial ou sem N definitivo não recebem classe.

| N-SPT granular | Compacidade           |
| -------------- | --------------------- |
| 0–4            | Fofa                  |
| 5–8            | Pouco compacta        |
| 9–18           | Medianamente compacta |
| 19–40          | Compacta              |
| >40            | Muito compacta        |

| N-SPT coesivo | Consistência |
| ------------- | ------------ |
| 0–2           | Muito mole   |
| 3–5           | Mole         |
| 6–10          | Média        |
| 11–19         | Rija         |
| 20–30         | Muito rija   |
| >30           | Dura         |

Ausência tem motivo explícito: SOIL_GROUP_UNDEFINED ou NSPT_UNAVAILABLE. A classificação não altera o motor aritmético, cuja engineVersion continua 0.1.0.

## Interface e PDF

Estado aparece no resultado salvo e na lista, junto ao N-SPT da análise e em detalhes por metro/camada; pode variar de um metro para outro na mesma camada. Somente o resumo compacto admite ellipsis, com tooltip e detalhe integral disponíveis. Critérios de compacidade e consistência é uma referência recolhível e responsiva. Geometria e alinhamento existentes foram preservados.

Template novo 0.8.5 inclui estado antes da descrição por metro. União de trechos exige tipo, descrição e estado iguais. Snapshot registra soilStateRuleVersion. Camadas/ensaios brutos, aprovações e emissões anteriores não são reescritos; worker mantém compatibilidade com 0.8.4 e versões anteriores suportadas. Aprovação técnica e classificação calculada são conceitos distintos.

## Referências e limite da verificação

A fonte documental consultada pela implementação foi a tabela da página 26 do [memorial publicado pelo Município de Faxinal](https://faxinal.sc.gov.br/uploads/sites/416/2024/08/ANEXO-VII-MEMORIAL-DESCRITIVO.pdf), identificada no documento como Segundo NBR 6484/2020 e compatível com estas faixas. O [resumo fornecido pelo usuário](https://sondagemsptem.com.br/ferramentas/classificacao-solo-nspt.html) diverge no intervalo 20–30; a exigência explícita do usuário foi manter Muito rija nesse intervalo e Dura acima de 30.

O link de catálogo ABNT estava expirado e não forneceu validação integral da norma. A referência/tabela implementada não constitui certificação ou declaração de conformidade global do SaaS, boletim ou procedimento de campo.

## Evidência do incremento

77 testes unitários e 16 de integração passaram antes da regressão adicional de autenticação; essa regressão, que impede resposta de conta antiga de derrubar nova sessão, passou no conjunto de seis testes de autenticação. Os dois fluxos de navegador afetados (análise e preenchimento/relatórios SPT) passaram na rodada final. Checagem de tipos e builds aprovados; API e frontend locais responderam com HTTP 200.

Quatro páginas PDF sintéticas foram geradas, renderizadas e inspecionadas, com preflight aprovado e sem cortes. São material de teste em work/soil-classification no diretório do chat, sem validade como documento real. Capturas locais em apps/web/.impeccable/review: soil-state-reference.png, soil-state-desktop.png, soil-state-dark.png e soil-state-mobile.png. A revisão de interface comunicou aprovação do escopo. Esta tarefa documental não reexecutou as suítes.

## Redação da descrição — modelo 0.8.6

As descrições geradas usam vírgulas entre tipo de solo, estado, cor, umidade e texto complementar, por exemplo: Argila arenosa, muito rija, marrom com veios variegados. Componentes após o tipo começam em minúscula quando não são abreviações; siglas, pontuação interna e valores originais permanecem preservados. A mudança é de apresentação, sem alterar as regras de compacidade/consistência. PDFs anteriores, incluindo0.8.5, mantêm a redação original. Verificação:26 testes unitários relacionados, fluxo completo de navegador e4páginas sintéticas renderizadas com preflight aprovado.
