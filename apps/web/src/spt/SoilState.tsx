import { classifySoilState } from './soil-state';
export function SoilStateText({
  soilType,
  result,
  explain = false,
}: {
  soilType: string;
  result: { status: string; nSpt: number | null };
  explain?: boolean;
}) {
  const state = classifySoilState(soilType, result);
  if (state.status === 'UNAVAILABLE')
    return explain ? (
      <span className="help">
        {state.reason === 'NSPT_UNAVAILABLE'
          ? 'Classificação indisponível: N-SPT não definitivo.'
          : 'Classificação não definida: confirme o tipo de solo predominante.'}
      </span>
    ) : null;
  return (
    <span className="soil-state" title={state.reference}>
      {state.property}: <strong>{state.designation}</strong>
    </span>
  );
}
