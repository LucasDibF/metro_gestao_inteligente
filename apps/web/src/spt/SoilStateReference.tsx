import { SOIL_STATE_BANDS, SOIL_STATE_REFERENCE } from './soil-state';
export function SoilStateReference() {
  return (
    <details className="soil-state-reference">
      <summary>Critérios de compacidade e consistência</summary>
      <p className="help">
        {SOIL_STATE_REFERENCE}. Aplicados ao N-SPT convencional, conforme o solo predominante
        informado. Não identificam o tipo de solo.
      </p>
      <div className="soil-state-tables">
        {(['GRANULAR', 'COHESIVE'] as const).map((group) => (
          <table key={group}>
            <caption>
              {group === 'GRANULAR'
                ? 'Areias e siltes arenosos · Compacidade'
                : 'Argilas e siltes argilosos · Consistência'}
            </caption>
            <thead>
              <tr>
                <th>N-SPT</th>
                <th>Classificação</th>
              </tr>
            </thead>
            <tbody>
              {SOIL_STATE_BANDS[group].map((band, index) => (
                <tr key={band.designation}>
                  <td>
                    {index === 0
                      ? `≤ ${band.maximum}`
                      : band.maximum === Infinity
                        ? `> ${SOIL_STATE_BANDS[group][index - 1].maximum}`
                        : `${SOIL_STATE_BANDS[group][index - 1].maximum + 1} a ${band.maximum}`}
                  </td>
                  <td>{band.designation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
    </details>
  );
}
