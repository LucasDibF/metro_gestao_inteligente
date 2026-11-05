import type { FieldDetails } from './field-types';
export type { FieldDetails } from './field-types';
export const methods: Record<string, string> = {
  TC: 'TC — Trado concha',
  TH: 'TH — Trado helicoidal',
  SP_TH: 'SP + TH — Percussão e trado',
  CA: 'CA — Circulação de água',
  SP_CA: 'SP + CA — Percussão e circulação de água',
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
    </div>
  );
}
