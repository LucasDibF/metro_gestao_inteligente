import { stateForMetre } from '../soil-state';
import { useId, useState } from 'react';
import { Droplets, Flag, Layers3 } from 'lucide-react';
import {
  sptGraphReading,
  displayDepth,
  graphMaximum,
  sampleBand,
  ROW_HEIGHT,
} from './profile-model';
import { number, type SheetData, type SheetSelection } from './types';
function material(type: string) {
  const value = type.toLocaleLowerCase('pt-BR');
  return value.includes('argil') ? 'clay' : value.includes('arei') ? 'sand' : 'silt';
}
export function AnalysisProfile({
  data,
  from,
  to,
  selection,
  onSelect,
  showFirst,
  showFinal,
  scale,
}: {
  data: SheetData;
  from: number;
  to: number;
  selection: SheetSelection;
  onSelect: (selection: SheetSelection) => void;
  showFirst: boolean;
  showFinal: boolean;
  scale: number;
}) {
  const [hoverDepth, setHoverDepth] = useState<number | null>(null);
  const pattern = useId().replaceAll(':', '');
  const height = (to - from) * ROW_HEIGHT;
  const endDepth = data.termination.depth > 0 ? Math.min(to, data.termination.depth) : to;
  const y = (depth: number) => (depth - from) * ROW_HEIGHT;
  const tests = data.tests.filter(
    (test) =>
      (displayDepth(test, data) > from || (from === 0 && Number(test.depthM) === 0)) &&
      displayDepth(test, data) <= endDepth,
  );
  const isTerminal = (test: SheetData['tests'][number]) =>
    data.termination.partial && Number(test.depthM) === data.termination.row;
  const regularBottom = Math.max(
    0,
    ...tests.filter((test) => !isTerminal(test)).map((test) => y(Number(test.depthM))),
  );
  const rowTop = (test: SheetData['tests'][number]) =>
    isTerminal(test)
      ? Math.max(y(displayDepth(test, data)) + 20, regularBottom)
      : y(sampleBand(Number(test.depthM), from, to).from);
  const sampleDepth = (test: SheetData['tests'][number]) =>
    isTerminal(test) ? displayDepth(test, data) : sampleBand(Number(test.depthM), from, to).center;
  const rowHeight = (test: SheetData['tests'][number]) =>
    isTerminal(test)
      ? ROW_HEIGHT
      : (sampleBand(Number(test.depthM), from, to).to -
          sampleBand(Number(test.depthM), from, to).from) *
        ROW_HEIGHT;
  const isHighlighted = (test: SheetData['tests'][number]) =>
    selection?.kind === 'test'
      ? Number(selection.depth) === Number(test.depthM)
      : selection?.kind === 'layer'
        ? Number(test.depthM) > Number(selection.from) &&
          Number(test.depthM) - 1 < Number(selection.to)
        : false;
  const surfaceTest = from === 0 ? tests.find((test) => Number(test.depthM) === 0) : undefined;
  const maximum = graphMaximum(data.tests);
  const gx = (value: number) => 20 + (value / maximum) * 280;
  const selectedDepth = selection?.kind === 'test' ? Number(selection.depth) : null;
  const selected = tests.find((test) => Number(test.depthM) === selectedDepth);
  const crosshair = hoverDepth ?? (selected ? sampleDepth(selected) : null);
  const levels = Array.from(
    { length: Math.ceil(to - from) },
    (_, index) => from + index + 1,
  ).filter((depth) => depth <= endDepth);
  function activate(event: React.KeyboardEvent<SVGGElement>, callback: () => void) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      callback();
    }
  }
  return (
    <div
      className="analysis-canvas-size"
      style={{ width: 940 * scale, height: (height + 136 + (surfaceTest ? 44 : 0)) * scale }}
    >
      <div className="analysis-canvas" style={{ width: 940, transform: `scale(${scale})` }}>
        {surfaceTest ? (
          <button
            className="analysis-surface-reading"
            type="button"
            aria-label="Consultar ensaio a 0 m"
            onClick={() => onSelect({ kind: 'test', depth: surfaceTest.depthM })}
          >
            Registro na superfície · 0 m ·{' '}
            {surfaceTest.advances.map((advance) => advance.blows).join(' / ')} golpes
          </button>
        ) : null}
        <div className="analysis-track-head">
          <span>Prof. / m</span>
          <span>
            <Layers3 size={15} aria-hidden="true" /> Perfil geológico
          </span>
          <span>Golpes / avanço</span>
          <span>Resistência · golpes / 30 cm</span>
          <span>Método</span>
        </div>
        <div
          className="analysis-tracks"
          style={{ height: height + 72 }}
          onMouseLeave={() => setHoverDepth(null)}
        >
          <div className="analysis-depth-track">
            {levels.map((depth) => (
              <span key={depth} style={{ top: y(depth) }}>
                {number(depth)}
              </span>
            ))}
            {to % 1 !== 0 ? <span style={{ top: height }}>{number(to)}</span> : null}
          </div>
          <div className="analysis-soil-track">
            {data.layers
              .filter((layer) => Number(layer.fromM) < endDepth && Number(layer.toM) > from)
              .map((layer) => {
                const start = Math.max(from, Number(layer.fromM)),
                  end = Math.min(endDepth, Number(layer.toM));
                const active =
                  selection?.kind === 'layer'
                    ? Number(selection.from) < end && Number(selection.to) > start
                    : selectedDepth !== null && selectedDepth > start && selectedDepth - 1 < end;
                return (
                  <button
                    type="button"
                    key={layer.id}
                    className={`analysis-soil ${material(layer.soilType)} ${active ? 'is-active' : ''}`}
                    style={{ top: y(start), height: y(end) - y(start) }}
                    aria-pressed={active}
                    aria-label={`Consultar camada de ${number(layer.fromM)} a ${number(layer.toM)} m`}
                    onClick={() => onSelect({ kind: 'layer', from: layer.fromM, to: layer.toM })}
                  >
                    <span className="analysis-stratum" aria-hidden="true">
                      <svg width="28" height="100%">
                        <defs>
                          <pattern
                            id={`${pattern}-${layer.id}`}
                            width="8"
                            height="8"
                            patternUnits="userSpaceOnUse"
                          >
                            {material(layer.soilType) === 'sand' ? (
                              <circle cx="3" cy="3" r="1" />
                            ) : (
                              <path
                                d={material(layer.soilType) === 'clay' ? 'M0 8L8 0' : 'M0 4H8'}
                              />
                            )}
                          </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill={`url(#${pattern}-${layer.id})`} />
                      </svg>
                    </span>
                    <span className="analysis-soil-copy">
                      <strong>{layer.soilType}</strong>
                      <span>
                        {[layer.soilColor, layer.soilMoisture].filter(Boolean).join(' · ')}
                      </span>
                      {end - start >= 1.5 ? (
                        <span className="analysis-description">{layer.description}</span>
                      ) : null}
                      <small>
                        {number(layer.fromM)}–{number(layer.toM)} m
                      </small>
                    </span>
                  </button>
                );
              })}
            {!data.layers.length ? (
              <p className="analysis-track-empty">Sem camadas descritas</p>
            ) : null}
          </div>
          <div className="analysis-blows-track">
            {levels
              .filter(
                (depth) => !tests.some((test) => Math.ceil(displayDepth(test, data)) === depth),
              )
              .map((depth) => (
                <div
                  key={depth}
                  className="analysis-missing-row"
                  style={{ top: y(depth - 1), height: ROW_HEIGHT }}
                >
                  Sem registro
                </div>
              ))}
            {tests
              .filter((test) => Number(test.depthM) !== 0)
              .map((test) => {
                const depth = displayDepth(test, data),
                  active = isHighlighted(test),
                  state = stateForMetre(test, data.layers);
                return (
                  <button
                    type="button"
                    key={test.id}
                    className={`analysis-reading ${active ? 'is-active' : ''}`}
                    style={{
                      top: rowTop(test),
                      height: rowHeight(test),
                    }}
                    aria-pressed={active}
                    aria-label={`Consultar ensaio a ${number(test.depthM)} m`}
                    onMouseEnter={() => setHoverDepth(sampleDepth(test))}
                    onFocus={() => setHoverDepth(sampleDepth(test))}
                    onBlur={() => setHoverDepth(null)}
                    onClick={() => onSelect({ kind: 'test', depth: test.depthM })}
                  >
                    <span>
                      {[0, 1, 2].map((index) => {
                        const a = test.advances[index];
                        return (
                          <strong key={index}>
                            {a
                              ? `${a.blows}${a.penetrationMm === 150 ? '' : `/${number(a.penetrationMm / 10)}`}`
                              : '—'}
                          </strong>
                        );
                      })}
                    </span>
                    <small
                      title={
                        state?.status === 'CLASSIFIED'
                          ? `${state.property}: ${state.designation} · ${state.reference}`
                          : undefined
                      }
                    >
                      {isTerminal(test)
                        ? `Fim · ${number(data.termination.depth)} m`
                        : test.result.nSpt === null
                          ? 'Leitura parcial / revisar'
                          : `N-SPT ${test.result.nSpt}${state?.status === 'CLASSIFIED' ? ' · ' + state.designation : ''}`}
                    </small>
                  </button>
                );
              })}
          </div>
          <svg
            className="analysis-graph"
            width="320"
            height={height + 72}
            role="group"
            aria-label="Curvas de resistência SPT por profundidade"
          >
            {Array.from({ length: 6 }, (_, i) => (i * maximum) / 5).map((tick) => (
              <g key={tick}>
                <line
                  x1={gx(tick)}
                  x2={gx(tick)}
                  y1="0"
                  y2={height}
                  className="analysis-grid-vertical"
                />
                <text x={gx(tick)} y="16" textAnchor="middle" className="analysis-axis-label">
                  {number(tick)}
                </text>
              </g>
            ))}
            {levels.map((depth) => (
              <line
                key={depth}
                x1="0"
                x2="320"
                y1={y(depth)}
                y2={y(depth)}
                className="analysis-grid-horizontal"
              />
            ))}
            {selection?.kind === 'layer' &&
            Math.min(endDepth, Number(selection.to)) > Math.max(from, Number(selection.from)) ? (
              <rect
                x="0"
                width="320"
                y={y(Math.max(from, Number(selection.from)))}
                height={
                  y(Math.min(endDepth, Number(selection.to))) -
                  y(Math.max(from, Number(selection.from)))
                }
                className="analysis-layer-range"
              />
            ) : null}
            {crosshair !== null && crosshair >= from && crosshair <= to ? (
              <line
                x1="0"
                x2="320"
                y1={y(crosshair)}
                y2={y(crosshair)}
                className="analysis-crosshair"
              />
            ) : null}
            {[0, 1].map((series) => {
              if (series === 0 ? !showFirst : !showFinal) return null;
              let previous: { depth: number; x: number; y: number } | null = null;
              return (
                <g
                  key={series}
                  className={series === 0 ? 'analysis-curve-first' : 'analysis-curve-final'}
                >
                  {tests.map((test) => {
                    const reading = sptGraphReading(test, series),
                      depth = displayDepth(test, data);
                    if (!reading) {
                      previous = null;
                      return null;
                    }
                    const value = reading.value;
                    const point = { depth, x: gx(value), y: y(sampleDepth(test)) };
                    const path =
                      previous && depth - previous.depth <= 1.01
                        ? `M${previous.x},${previous.y}L${point.x},${point.y}`
                        : null;
                    previous = point;
                    return (
                      <g
                        key={test.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`Consultar curva ${series + 1} a ${number(test.depthM)} m: ${reading.conventional ? `${value} golpes` : `${reading.label} golpes/cm · leitura parcial`}`}
                        aria-pressed={isHighlighted(test)}
                        onMouseEnter={() => setHoverDepth(sampleDepth(test))}
                        onClick={() => onSelect({ kind: 'test', depth: test.depthM })}
                        onKeyDown={(event) =>
                          activate(event, () => onSelect({ kind: 'test', depth: test.depthM }))
                        }
                      >
                        {path ? (
                          <path className="analysis-draw-curve" pathLength="1" d={path} />
                        ) : null}
                        <circle className="analysis-point-hit" cx={point.x} cy={point.y} r="12" />
                        <circle
                          className="analysis-point"
                          data-reading={reading.label}
                          cx={point.x}
                          cy={point.y}
                          r={isHighlighted(test) ? 6 : 4}
                        />
                        <title>
                          {number(depth)} m ·{' '}
                          {reading.conventional
                            ? `${value} golpes`
                            : `${reading.label} golpes/cm · leitura parcial, sem N-SPT convencional`}
                        </title>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
          <div className="analysis-method-track">
            {tests
              .filter((test) => Number(test.depthM) !== 0)
              .map((test) => (
                <span
                  key={test.id}
                  style={{
                    top: rowTop(test),
                    height: rowHeight(test),
                  }}
                >
                  {test.fieldDetails?.executionMethod?.replaceAll('_', '+') ?? '—'}
                </span>
              ))}
          </div>
          {data.hole.waterLevelM !== null &&
          Number(data.hole.waterLevelM) >= from &&
          Number(data.hole.waterLevelM) <= to ? (
            <div className="analysis-water" style={{ top: y(Number(data.hole.waterLevelM)) }}>
              <span>
                <Droplets size={14} aria-hidden="true" /> NA {number(data.hole.waterLevelM)} m
              </span>
            </div>
          ) : null}
          {data.termination.depth > from && data.termination.depth <= to ? (
            <div className="analysis-termination" style={{ top: y(data.termination.depth) }}>
              <span>
                <Flag size={13} aria-hidden="true" /> Fim {number(data.termination.depth)} m
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
