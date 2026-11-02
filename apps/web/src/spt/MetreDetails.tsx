import type { FieldDetails } from './field-types';
export type { FieldDetails } from './field-types';
export const methods: Record<string, string> = {
  TC: 'TC — Trado concha',
  TH: 'TH — Trado helicoidal',
  SP_TH: 'SP + TH — Percussão e trado',
  CA: 'CA — Circulação de água',
  SP_CA: 'SP + CA — Percussão e circulação de água',
};
export const recoveries: Record<string, string> = {
  INTEGRA: 'Íntegra',
  PARCIAL: 'Parcial',
  NENHUMA: 'Nenhuma',
};
export function MetreDetails({ value }: { value?: FieldDetails | null }) {
  return (
    <div className="field-pair">
      <div>
        <label htmlFor="metre-method">Método de execução deste metro</label>
        <select
          id="metre-method"
          name="executionMethod"
          defaultValue={value?.executionMethod ?? ''}
        >
          <option value="">Não informado</option>
          {Object.entries(methods).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="metre-recovery">Recuperação da amostra</label>
        <select
          id="metre-recovery"
          name="sampleRecovery"
          defaultValue={value?.sampleRecovery ?? ''}
        >
          <option value="">Não informada</option>
          {Object.entries(recoveries).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
