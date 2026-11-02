interface Layer {
  id: string;
  fromM: string;
  toM: string;
  soilType: string;
  description: string;
  soilColor?: string | null;
  soilMoisture?: string | null;
}
interface Test {
  id: string;
  depthM: string;
  result: { nSpt: number | null; status: string };
}
export function GeotechnicalProfile({
  layers,
  tests,
  executedDepthM,
}: {
  layers: Layer[];
  tests: Test[];
  executedDepthM: string | null;
}) {
  if (!layers.length && !tests.length) return null;
  const depth = Math.max(
    Number(executedDepthM),
    ...layers.map((l) => Number(l.toM)),
    ...tests.map((t) => Number(t.depthM)),
    1,
  );
  const maxN = Math.max(50, ...tests.map((t) => t.result.nSpt ?? 0));
  const plotHeight = 360,
    top = 40,
    left = 210,
    width = 280;
  const y = (value: number) => top + (value / depth) * plotHeight;
  const x = (value: number) => left + (value / maxN) * width;
  const points = tests.filter((t) => t.result.nSpt !== null);
  const step = Math.max(1, Math.ceil(depth / 20));
  const ticks = Array.from({ length: Math.floor(depth / step) + 1 }, (_, i) => i * step);
  return (
    <section className="panel geotechnical-preview" aria-labelledby="profile-title">
      <h3 id="profile-title">Conferência do perfil geotécnico</h3>
      <p className="help">
        Camadas informadas e N-SPT calculado pelo servidor. Registros sem resultado definitivo não
        são representados como zero. Esta visualização não substitui a aprovação técnica.
      </p>
      <p className="help profile-scroll-help">
        No celular, deslize o gráfico para conferir toda a escala.
      </p>
      <div
        className="profile-graph-scroll"
        tabIndex={0}
        role="region"
        aria-label="Gráfico do perfil com rolagem horizontal"
      >
        <svg role="img" aria-labelledby="profile-svg-title profile-svg-desc" viewBox="0 0 540 445">
          <title id="profile-svg-title">Perfil de solo e N-SPT por profundidade</title>
          <desc id="profile-svg-desc">
            Profundidade até {depth.toLocaleString('pt-BR')} metros. Consulte também a tabela de
            resultados e a lista de camadas abaixo.
          </desc>
          <text x="20" y="20">
            Prof. (m)
          </text>
          <text x="100" y="20">
            Camadas
          </text>
          <text x="315" y="20">
            N-SPT
          </text>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1="65" x2="490" y1={y(tick)} y2={y(tick)} className="profile-grid" />
              <text x="52" y={y(tick) + 4} textAnchor="end">
                {tick.toLocaleString('pt-BR')}
              </text>
            </g>
          ))}
          {[0, 1, 2, 3, 4, 5].map((tick) => (
            <g key={tick}>
              <line
                x1={x((tick * maxN) / 5)}
                x2={x((tick * maxN) / 5)}
                y1={top}
                y2={top + plotHeight}
                className="profile-grid"
              />
              <text x={x((tick * maxN) / 5)} y="33" textAnchor="middle">
                {Math.round((tick * maxN) / 5)}
              </text>
            </g>
          ))}
          {layers.map((layer, index) => (
            <g key={layer.id}>
              <rect
                x="75"
                y={y(Number(layer.fromM))}
                width="100"
                height={Math.max(1, y(Number(layer.toM)) - y(Number(layer.fromM)))}
                className={index % 2 ? 'profile-layer alternate' : 'profile-layer'}
              >
                <title>
                  {layer.fromM}–{layer.toM} m: {layer.soilType}. {layer.description}
                </title>
              </rect>
              <text
                x="125"
                y={y((Number(layer.fromM) + Number(layer.toM)) / 2) + 4}
                textAnchor="middle"
              >
                {index + 1}
              </text>
            </g>
          ))}
          {points.map((point) => (
            <circle
              key={point.id}
              cx={x(point.result.nSpt!)}
              cy={y(Number(point.depthM))}
              r="4"
              className="profile-point"
            >
              <title>
                {point.depthM} m: N-SPT {point.result.nSpt}
              </title>
            </circle>
          ))}
        </svg>
      </div>
      <p className="help">
        Os números identificam as camadas abaixo. As cores apenas separam intervalos.
      </p>
      <ol className="profile-layer-list">
        {layers.map((layer) => (
          <li key={layer.id}>
            <strong>
              {layer.fromM}–{layer.toM} m · {layer.soilType}
            </strong>
            <p>
              {[layer.soilColor, layer.soilMoisture, layer.description].filter(Boolean).join(' · ')}
            </p>
          </li>
        ))}
      </ol>
      <div className="table-scroll">
        <table>
          <caption>Resultados por profundidade</caption>
          <thead>
            <tr>
              <th>Profundidade (m)</th>
              <th>N-SPT</th>
              <th>Resultado</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((test) => (
              <tr key={test.id}>
                <td>{Number(test.depthM).toLocaleString('pt-BR')}</td>
                <td>{test.result.nSpt ?? 'Não calculado'}</td>
                <td>
                  {(
                    {
                      CONVENTIONAL: 'Convencional',
                      INTERRUPTED: 'Interrompido',
                      INCOMPLETE: 'Incompleto',
                      REQUIRES_REVIEW: 'Requer revisão',
                    } as Record<string, string>
                  )[test.result.status] ?? test.result.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
