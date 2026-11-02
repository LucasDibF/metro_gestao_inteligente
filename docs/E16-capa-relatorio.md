# E16 Capa do relatório SPT

Template 0.8.10 adiciona capa às novas emissões, baseada na estrutura centralizada de `sondagem/pdf-service/src/report-engine/sections/cover/cover.section.ts` e nos estilos de sua base de relatório.

Empresa no topo; título Relatório de sondagem à percussão SPT, cliente, obra e data no miolo; cidade/UF e ano no rodapé. Somente dados do snapshot da emissão, com escape HTML. Data e ano usam America/Sao_Paulo. Cidade e cliente ausentes permanecem explicitamente não informados.

A capa ocupa uma folha A4 e participa da numeração global. Não adiciona contracapa, sumário, assinatura ou ART. CSS próprio preserva geometria e conteúdo dos perfis aprovados. Novas emissões usam 0.8.10; snapshots 0.8.9 e anteriores continuam sem capa. PDFs existentes não são reescritos.

Validação: teste de data na virada de ano, caracteres HTML, ausências, ordem da capa, compatibilidade do perfil com 0.8.9 e preflight com nomes longos. A prévia usa dados sintéticos e não homologa conteúdo técnico real.
