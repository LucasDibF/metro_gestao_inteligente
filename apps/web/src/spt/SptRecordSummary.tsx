import { classifySoilState, formatSoilDescription } from './soil-state';
import { methods } from './MetreDetails';
import { sptResultLabels as labels, type SptRecord } from './record-types';
export function SptRecordSummary({ record }: { record: SptRecord }) {
  return (
    <div>
      <h3>Ensaio a {Number(record.depthM).toLocaleString('pt-BR')} m</h3>
      <p>
        {labels[record.result.status]} · N-SPT:{' '}
        {record.result.nSpt === null ? 'Não calculado' : record.result.nSpt}
      </p>
      <p>
        {record.advances.length
          ? record.advances
              .map(
                (advance) =>
                  `${advance.blows} golpes / ${(advance.penetrationMm / 10).toLocaleString('pt-BR')} cm`,
              )
              .join(' · ')
          : 'Sem avanços registrados'}
      </p>
      {record.soil.length ? (
        record.soil.map((layer) => {
          const state = classifySoilState(layer.soilType, record.result);
          return (
            <p key={layer.id}>
              {formatSoilDescription([
                layer.soilType,
                state.status === 'CLASSIFIED' ? state.designation : null,
                layer.soilColor,
                layer.soilMoisture,
                layer.description,
              ])}
            </p>
          );
        })
      ) : (
        <p>Descrição do solo pendente.</p>
      )}
      {record.fieldDetails ? (
        <p>
          {record.fieldDetails.executionMethod
            ? methods[record.fieldDetails.executionMethod]
            : 'Método não informado'}{' '}
        </p>
      ) : null}
      {record.interruptionReason ? <p>Interrupção: {record.interruptionReason}</p> : null}
    </div>
  );
}
