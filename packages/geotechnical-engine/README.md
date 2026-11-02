# Motor SPT

Função pura evaluateSpt; contrato e limites em ../../docs/E04-motor.md.

```ts
import { evaluateSpt } from '@spt/geotechnical-engine';
const result = evaluateSpt({ advances: [
  { blows: 4, penetrationMm: 150 },
  { blows: 6, penetrationMm: 150 },
  { blows: 8, penetrationMm: 150 },
] });
// CONVENTIONAL, nSpt 14. Cálculo não equivale a aprovação técnica.
```

Entradas incompletas, interrompidas ou especiais não recebem N-SPT definitivo. Sem acesso a banco, rede ou ambiente. Testes do pacote integram npm test na raiz.
