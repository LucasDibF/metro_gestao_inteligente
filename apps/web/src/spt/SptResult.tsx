import { classifySoilState, formatSoilDescription } from './soil-state';
import { SoilStateText } from './SoilState';
import { sptResultLabels, type SptRecord } from './record-types';

/** Result of the metre just saved: status, N-SPT and the soil as it will be described. */
export function SptResult({ result }: { result: SptRecord }) {
  return (
    <section className="panel spt-result" aria-labelledby="spt-result-title">
      <h3 id="spt-result-title">Resultado do ensaio</h3>
      <p>
        <strong>{sptResultLabels[result.result.status]}</strong>
      </p>
      <p>
        N-SPT: <strong>{result.result.nSpt === null ? 'Não calculado' : result.result.nSpt}</strong>
      </p>
      {result.soil?.map((layer) => {
        const state = classifySoilState(layer.soilType, result.result);
        return (
          <div key={layer.id}>
            <p>
              {formatSoilDescription([
                layer.soilType,
                state.status === 'CLASSIFIED' ? state.designation : null,
                layer.soilColor,
                layer.soilMoisture,
                layer.description,
              ])}
            </p>
            {state.status !== 'CLASSIFIED' ? (
              <p>
                <SoilStateText soilType={layer.soilType} result={result.result} explain />
              </p>
            ) : null}
          </div>
        );
      })}
      <p className="help">
        {result.result.status === 'CONVENTIONAL'
          ? 'Soma dos golpes do segundo e terceiro avanços de 15 cm. O cálculo não equivale a aprovação técnica.'
          : 'Os dados foram preservados. Este ensaio não recebeu um N-SPT definitivo e precisa ser completado ou revisado.'}
      </p>
    </section>
  );
}
