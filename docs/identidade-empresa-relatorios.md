# Identidade da empresa nos relatórios

O modelo 0.8.13 usa a logo PNG cadastrada no perfil da empresa na capa e nos cabeçalhos do perfil SPT, registro fotográfico e croqui. Mantém as proporções da imagem e a geometria técnica do modelo. Na ausência de uma logo válida, apresenta o nome da empresa, sem substituir pela marca Metro.

A emissão copia a logo para o snapshot imutável do relatório. Alterar o cadastro da empresa não modifica documentos já emitidos. Relatórios de versões anteriores continuam usando seu modelo original; para aplicar a identidade da empresa, solicite uma nova emissão.

A imagem deve ser um PNG incorporado, limitado a 400 mil caracteres na URL de dados. Referências externas e SVG não são aceitos pelo renderizador da marca.

Validação: 34 testes de modelo e layout, teste integrado de emissão e imutabilidade, verificação de tipos da API e do worker e inspeção visual das quatro páginas de uma prévia Geoplan com dados sintéticos.
