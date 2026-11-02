import { SoilStateText } from '../SoilState';
import { SOIL_STATE_REFERENCE } from '../soil-state';
import { useEffect, useState } from 'react';
import { Pencil, Camera, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import { auth } from '../../auth/client';
import { methods, recoveries } from '../MetreDetails';
import {
  number,
  resultLabels,
  type SheetData,
  type SheetLayer,
  type SheetPhoto,
  type SheetSelection,
} from './types';
const purposes: Record<string, string> = {
  SITE: 'Local da sondagem',
  EXECUTION: 'Execução da sondagem',
  SAMPLE_1: 'Amostra 1',
  SAMPLE_2: 'Amostra 2',
  OTHER: 'Outras fotografias',
};
function sum(advances: SheetData['tests'][number]['advances'], start: number) {
  const pair = advances.slice(start, start + 2);
  if (pair.length !== 2) return 'Não disponível';
  const blows = pair.reduce((n, a) => n + a.blows, 0),
    mm = pair.reduce((n, a) => n + a.penetrationMm, 0);
  return mm === 300 ? String(blows) : `${blows}/${number(mm / 10)}`;
}
function Photo({
  photo,
  base,
  onError,
}: {
  photo: SheetPhoto;
  base: string;
  onError: (e: unknown) => void;
}) {
  const [url, setUrl] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true,
      objectUrl = '';
    const controller = new AbortController();
    auth
      .request<Blob>(
        `${base}/fotografias/${photo.id}/preview`,
        { signal: controller.signal },
        (r) => r.blob(),
      )
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch((e) => {
        if (active && e.name !== 'AbortError') {
          setError(e.message);
          onError(e);
        }
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [base, photo.id]);
  return error ? (
    <p className="error" role="alert">
      {error}
    </p>
  ) : url ? (
    <figure className="sheet-photo">
      <img src={url} alt={photo.caption} />
      <figcaption>{photo.caption}</figcaption>
    </figure>
  ) : (
    <p role="status">Carregando fotografia…</p>
  );
}
export function SheetInspector({
  data,
  selection,
  onSelect,
  onEditMetre,
  onEditLayer,
  editDisabled,
  base,
  onError,
}: {
  data: SheetData;
  selection: SheetSelection;
  onSelect: (value: SheetSelection) => void;
  onEditMetre?: (depth: string) => void;
  onEditLayer?: (layer: SheetLayer) => void;
  editDisabled: boolean;
  base: string;
  onError: (e: unknown) => void;
}) {
  const [photo, setPhoto] = useState<SheetPhoto | null>(null);
  const test =
    selection?.kind === 'test'
      ? data.tests.find((t) => Number(t.depthM) === Number(selection.depth))
      : undefined;
  const layers =
    selection?.kind === 'layer'
      ? data.layers.filter(
          (l) => Number(l.fromM) < Number(selection.to) && Number(l.toM) > Number(selection.from),
        )
      : test
        ? data.layers.filter(
            (l) =>
              Number(l.fromM) < (Number(test.depthM) === 0 ? 1 : Number(test.depthM)) &&
              Number(l.toM) > Math.max(0, Number(test.depthM) - 1),
          )
        : [];
  return (
    <>
      <div className="sheet-inspector-heading">
        <h4>Detalhes da execução</h4>
        {selection ? (
          <Button
            icon={X}
            className="ghost icon-button"
            aria-label="Limpar seleção da folha"
            onClick={() => onSelect(null)}
          />
        ) : null}
      </div>
      {!selection ? (
        <>
          <p>Selecione um metro ou uma camada na folha para consultar os registros.</p>
          <dl className="sheet-facts">
            <dt>Furo</dt>
            <dd>{data.hole.code}</dd>
            <dt>Profundidade executada</dt>
            <dd>
              {data.hole.executedDepthM === null
                ? 'Não informada'
                : `${number(data.hole.executedDepthM)} m`}
            </dd>
            <dt>Nível d’água</dt>
            <dd>
              {data.hole.waterLevelM === null
                ? 'Não informado'
                : `${number(data.hole.waterLevelM)} m`}
            </dd>
            <dt>Revisão</dt>
            <dd>
              {
                (
                  {
                    DRAFT: 'Em preparação',
                    IN_REVIEW: 'Aguardando revisão',
                    APPROVED: 'Aprovado tecnicamente',
                  } as Record<string, string>
                )[data.hole.reviewState]
              }
            </dd>
          </dl>
        </>
      ) : null}
      {test ? (
        <section aria-label="Detalhes do metro selecionado">
          <h4>Ensaio a {number(test.depthM)} m</h4>
          <p>
            {resultLabels[test.result.status]} ·{' '}
            <strong>N-SPT: {test.result.nSpt ?? 'Não calculado'}</strong>
          </p>
          {data.termination.partial && Number(test.depthM) === data.termination.row ? (
            <p>
              Encerramento medido: <strong>{number(data.termination.depth)} m</strong>.
            </p>
          ) : null}
          <table className="sheet-advance-table">
            <caption>Avanços registrados</caption>
            <thead>
              <tr>
                <th>Avanço</th>
                <th>Golpes</th>
                <th>Pen. (cm)</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2].map((i) => (
                <tr key={i}>
                  <td>{i + 1}º</td>
                  <td>{test.advances[i]?.blows ?? '—'}</td>
                  <td>{test.advances[i] ? number(test.advances[i].penetrationMm / 10) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="sheet-sum-first">
            1º + 2º: <strong>{sum(test.advances, 0)}</strong>
          </p>
          <p className="sheet-sum-final">
            2º + 3º: <strong>{sum(test.advances, 1)}</strong>
          </p>
          <dl className="sheet-facts">
            <dt>Método</dt>
            <dd>{methods[test.fieldDetails?.executionMethod ?? ''] ?? 'Não informado'}</dd>
            <dt>Recuperação</dt>
            <dd>{recoveries[test.fieldDetails?.sampleRecovery ?? ''] ?? 'Não informada'}</dd>
            <dt>Versão do registro</dt>
            <dd>{test.version}</dd>
          </dl>
          {test.interruptionReason ? (
            <p>
              <strong>Interrupção:</strong> {test.interruptionReason}
            </p>
          ) : null}
          {onEditMetre ? (
            <Button
              icon={Pencil}
              className="secondary"
              disabled={editDisabled}
              onClick={() => onEditMetre(test.depthM)}
            >
              Corrigir registro selecionado
            </Button>
          ) : null}
        </section>
      ) : null}
      {selection?.kind === 'layer' ? (
        <h4>
          Camada de {number(selection.from)} a {number(selection.to)} m
        </h4>
      ) : null}
      {layers.map((layer) => (
        <section key={layer.id} className="sheet-layer-details">
          <h4>{layer.soilType}</h4>
          <p>
            {number(layer.fromM)}–{number(layer.toM)} m
          </p>
          {layer.soilColor || layer.soilMoisture ? (
            <p>{[layer.soilColor, layer.soilMoisture].filter(Boolean).join(', ')}</p>
          ) : null}
          <p className="soil-description">{layer.description}</p>
          {test ? (
            <p>
              <SoilStateText soilType={layer.soilType} result={test.result} explain />
            </p>
          ) : null}
          {onEditLayer ? (
            <Button
              icon={Pencil}
              className="secondary"
              disabled={editDisabled}
              onClick={() => onEditLayer(layer)}
            >
              Editar camada
              <span className="sr-only">
                {' '}
                de {number(layer.fromM)} a {number(layer.toM)} m
              </span>
            </Button>
          ) : null}
        </section>
      ))}
      {selection?.kind === 'layer' ? (
        <section className="sheet-layer-details">
          <h4>Estado por metro</h4>
          {data.tests
            .filter(
              (item) =>
                Number(item.depthM) > Number(selection.from) &&
                Math.max(0, Number(item.depthM) - 1) < Number(selection.to),
            )
            .map((item) => (
              <div key={item.id}>
                <p>
                  <strong>{number(item.depthM)} m</strong> · N-SPT{' '}
                  {item.result.nSpt ?? 'Não calculado'}
                </p>
                {layers
                  .filter(
                    (layer) =>
                      Number(layer.fromM) < Number(item.depthM) &&
                      Number(layer.toM) > Math.max(0, Number(item.depthM) - 1),
                  )
                  .map((layer) => (
                    <p key={layer.id}>
                      {layer.soilType} ·{' '}
                      <SoilStateText soilType={layer.soilType} result={item.result} explain />
                    </p>
                  ))}
              </div>
            ))}
        </section>
      ) : null}
      {selection ? (
        <p className="help">
          {SOIL_STATE_REFERENCE}. Classificação calculada a partir do solo informado e do N-SPT;
          sujeita à conferência técnica.
        </p>
      ) : null}
      <section className="sheet-photos">
        <h4>Fotografias do furo</h4>
        <p className="help">Vinculadas ao furo; não a um metro específico.</p>
        {data.photos.length ? (
          data.photos.map((item) => (
            <Button
              key={item.id}
              icon={Camera}
              className="secondary"
              disabled={item.processingState !== 'READY'}
              onClick={() => setPhoto(item)}
            >
              {purposes[item.purpose ?? 'OTHER']} · {item.caption}
              {item.processingState !== 'READY' ? ' (indisponível)' : ''}
            </Button>
          ))
        ) : (
          <p className="help">Nenhuma fotografia cadastrada.</p>
        )}
        {photo ? (
          <>
            <Button icon={X} className="ghost" onClick={() => setPhoto(null)}>
              Fechar fotografia
            </Button>
            <Photo key={photo.id} photo={photo} base={base} onError={onError} />
          </>
        ) : null}
      </section>
    </>
  );
}
