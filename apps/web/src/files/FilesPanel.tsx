import { canRecordField } from '../auth/permissions';
import { hasRole } from '../auth/permissions';
import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import { RefreshCw, Pencil, Plus, Save, X, Upload, Image, Check, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { auth, longRequestSignal, type Profile } from '../auth/client';
interface Coordinate {
  id: string;
  kind: 'PLANNED' | 'EXECUTED';
  eastingM: string;
  northingM: string;
  zone: number;
  hemisphere: string;
  datum: string;
  altitudeM: string | null;
  reference: string;
  version: number;
}
interface Photo {
  processingState: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  id: string;
  caption: string;
  purpose: string | null;
  version: number;
  gpsLatitude: number | null;
  distanceM: number | null;
  gpsWarning: boolean;
  crop: { x: number; y: number; width: number; height: number };
}
const purposes: Record<string, string> = {
  SITE: 'Local da sondagem',
  EXECUTION: 'Execução da sondagem',
  SAMPLE_1: 'Amostra 1',
  SAMPLE_2: 'Amostra 2',
  OTHER: 'Outras fotografias',
};
interface Data {
  technicalVersion: number;
  officialCoordinateId: string | null;
  coordinates: Coordinate[];
  photos: Photo[];
}
const maxPhotoBytes = 8 * 1024 * 1024;
export function FilesPanel({
  workId,
  boreholeId,
  profile,
  onError,
  reviewState,
  onTechnicalChange,
  refreshKey,
  mode = 'all',
  onEditingChange,
}: {
  mode?: 'all' | 'coordinates' | 'photos';
  onEditingChange?: (editing: boolean) => void;
  workId: string;
  boreholeId: string;
  profile: Profile;
  reviewState?: string;
  onError: (e: unknown) => void;
  onTechnicalChange: () => void;
  refreshKey?: number;
}) {
  const [data, setData] = useState<Data | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState<'PLANNED' | 'EXECUTED' | null>(null),
    [upload, setUpload] = useState(false),
    [photoEditor, setPhotoEditor] = useState<Photo | null>(null),
    [remove, setRemove] = useState<string | null>(null),
    [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    onEditingChange?.(Boolean(kind || upload || photoEditor || remove));
    return () => onEditingChange?.(false);
  }, [kind, upload, photoEditor, remove, onEditingChange]);
  const errorRef = useRef<HTMLDivElement>(null),
    base = `/obras/${workId}/furos/${boreholeId}/arquivos`,
    canWrite = canRecordField(profile, reviewState);
  useEffect(() => {
    let active = true;
    auth
      .request<Data>(base)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          onError(e);
        }
      });
    return () => {
      active = false;
    };
  }, [base, revision, refreshKey, onError]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );
  useEffect(() => {
    if (error) {
      errorRef.current?.focus({ preventScroll: true });
      errorRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [error]);
  async function perform(action: () => Promise<unknown>, technical = false) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
      setRevision((v) => v + 1);
      setKind(null);
      setUpload(false);
      setPhotoEditor(null);
      setRemove(null);
      setMessage('Dados de localização e fotografias atualizados.');
      if (technical) onTechnicalChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  const current = data?.coordinates.find((c) => c.kind === kind);
  function coordinate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void perform(
      () =>
        auth.request(base + '/coordenadas/' + (kind === 'PLANNED' ? 'planejada' : 'executada'), {
          method: 'PUT',
          body: JSON.stringify({
            eastingM: String(values.get('east')),
            northingM: String(values.get('north')),
            zone: Number(values.get('zone')),
            hemisphere: String(values.get('hemisphere')),
            datum: 'SIRGAS2000',
            altitudeM: String(values.get('altitude')) || null,
            reference: String(values.get('reference')),
            ...(current ? { version: current.version } : {}),
          }),
        }),
      true,
    );
  }
  function photo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const file = values.get('file');
    if (file instanceof File && file.size > maxPhotoBytes) {
      setMessage('');
      setError('A fotografia ultrapassa 8 MB. Escolha um arquivo menor.');
      return;
    }
    void perform(
      () =>
        auth.request(base + '/fotografias', {
          method: 'POST',
          body: values,
          signal: longRequestSignal(),
        }),
      true,
    );
  }
  function savePhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photoEditor) return;
    const values = new FormData(event.currentTarget);
    void perform(() =>
      auth.request(base + '/fotografias/' + photoEditor.id, {
        method: 'PUT',
        body: JSON.stringify({
          version: photoEditor.version,
          caption: String(values.get('caption')),
          purpose: String(values.get('purpose')),
          crop: Object.fromEntries(
            ['x', 'y', 'width', 'height'].map((k) => [k, Number(values.get(k)) / 100]),
          ),
        }),
      }),
    );
  }
  async function show(photo: Photo) {
    setBusy(true);
    setError('');
    try {
      const blob = await auth.request<Blob>(
        base + '/fotografias/' + photo.id + '/preview',
        {},
        (r) => r.blob(),
      );
      setPreview({ id: photo.id, url: URL.createObjectURL(blob) });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir a fotografia.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="files-panel" aria-labelledby="files-title">
      <h3 id="files-title">
        {mode === 'photos'
          ? 'Fotografias do furo'
          : mode === 'coordinates'
            ? 'Localização do furo'
            : 'Localização e fotografias'}
      </h3>
      {error ? (
        <div className="error" role="alert" tabIndex={-1} ref={errorRef}>
          <p>{error}</p>
          <Button
            icon={RefreshCw}
            className="secondary"
            disabled={busy}
            onClick={() => {
              setError('');
              setRevision((v) => v + 1);
            }}
          >
            Recarregar localização e fotografias
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="notice">
          {message}
        </p>
      ) : null}
      {!data ? (
        error ? null : (
          <LoadingState>Carregando localização e fotografias…</LoadingState>
        )
      ) : (
        <>
          <div hidden={mode === 'photos'}>
            <h4>Coordenadas do furo</h4>
            <p className="help">
              UTM, datum SIRGAS2000. Escolha uma referência oficial para usar nos croquis e
              relatórios. O GPS da fotografia serve apenas para conferência.
            </p>
            <ul className="work-list">
              {data.coordinates.map((c) => (
                <li key={c.id}>
                  <div>
                    <h3>
                      {c.kind === 'PLANNED' ? 'Planejada' : 'Executada'}
                      {data.officialCoordinateId === c.id ? ' · Oficial' : ''}
                    </h3>
                    <p>
                      E {c.eastingM} m · N {c.northingM} m · Fuso {c.zone}
                      {c.hemisphere}
                    </p>
                    <p>{c.reference}</p>
                  </div>
                  {canWrite && (c.kind !== 'PLANNED' || hasRole(profile, 'ENGINEER')) ? (
                    <div className="row-actions">
                      <Button
                        icon={Pencil}
                        className="secondary"
                        disabled={busy || !!kind}
                        onClick={() => setKind(c.kind)}
                      >
                        Editar coordenada {c.kind === 'PLANNED' ? 'planejada' : 'executada'}
                      </Button>
                      {data.officialCoordinateId !== c.id ? (
                        <Button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            void perform(
                              () =>
                                auth.request(base + '/coordenadas/oficial', {
                                  method: 'PUT',
                                  body: JSON.stringify({
                                    coordinateId: c.id,
                                    technicalVersion: data.technicalVersion,
                                  }),
                                }),
                              true,
                            )
                          }
                        >
                          Usar como oficial
                          <span className="sr-only">
                            {' '}
                            {c.kind === 'PLANNED' ? 'planejada' : 'executada'}
                          </span>
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {canWrite && !kind ? (
              <div className="form-actions">
                {hasRole(profile, 'ENGINEER') &&
                !data.coordinates.some((c) => c.kind === 'PLANNED') ? (
                  <Button
                    icon={Plus}
                    className="secondary"
                    disabled={busy}
                    onClick={() => setKind('PLANNED')}
                  >
                    Adicionar coordenada planejada
                  </Button>
                ) : null}
                {!data.coordinates.some((c) => c.kind === 'EXECUTED') ? (
                  <Button
                    icon={Plus}
                    className="secondary"
                    disabled={busy}
                    onClick={() => setKind('EXECUTED')}
                  >
                    Adicionar coordenada executada
                  </Button>
                ) : null}
              </div>
            ) : null}
            {kind ? (
              <form className="panel" key={kind + '-' + revision} onSubmit={coordinate}>
                <fieldset disabled={busy}>
                  <legend>Coordenada {kind === 'PLANNED' ? 'planejada' : 'executada'}</legend>
                  <div className="field-pair">
                    <div>
                      <label htmlFor="coord-east">Este (m)</label>
                      <input
                        id="coord-east"
                        name="east"
                        type="number"
                        required
                        min="100000"
                        max="900000"
                        step="0.01"
                        defaultValue={current?.eastingM ?? ''}
                      />
                    </div>
                    <div>
                      <label htmlFor="coord-north">Norte (m)</label>
                      <input
                        id="coord-north"
                        name="north"
                        type="number"
                        required
                        min="0"
                        max="10000000"
                        step="0.01"
                        defaultValue={current?.northingM ?? ''}
                      />
                    </div>
                  </div>
                  <div className="field-pair">
                    <div>
                      <label htmlFor="coord-zone">Fuso UTM</label>
                      <input
                        id="coord-zone"
                        name="zone"
                        type="number"
                        required
                        min="1"
                        max="60"
                        step="1"
                        defaultValue={current?.zone ?? ''}
                      />
                    </div>
                    <div>
                      <label htmlFor="coord-hemisphere">Hemisfério</label>
                      <select
                        id="coord-hemisphere"
                        name="hemisphere"
                        defaultValue={current?.hemisphere ?? 'S'}
                      >
                        <option value="S">Sul</option>
                        <option value="N">Norte</option>
                      </select>
                    </div>
                  </div>
                  <label htmlFor="coord-altitude">Altitude em metros (opcional)</label>
                  <input
                    id="coord-altitude"
                    name="altitude"
                    type="number"
                    min="-500"
                    max="9000"
                    step="0.01"
                    defaultValue={current?.altitudeM ?? ''}
                  />
                  <label htmlFor="coord-reference">Origem da coordenada</label>
                  <input
                    id="coord-reference"
                    name="reference"
                    required
                    maxLength={500}
                    defaultValue={current?.reference ?? ''}
                    placeholder="Ex.: levantamento de campo"
                  />
                  <p className="help">
                    Alterar uma coordenada oficial exige nova aprovação técnica.
                  </p>
                  <div className="form-actions">
                    <Button icon={Save}>Salvar coordenada</Button>
                    <Button
                      icon={X}
                      className="secondary"
                      type="button"
                      onClick={() => setKind(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </fieldset>
              </form>
            ) : null}
          </div>
          <div hidden={mode === 'coordinates'}>
            <div className="section-heading">
              <h4>Fotografias</h4>
              {canWrite && !upload ? (
                <Button
                  icon={Plus}
                  className="secondary"
                  disabled={busy}
                  onClick={() => setUpload(true)}
                >
                  Adicionar fotografia
                </Button>
              ) : null}
            </div>
            {upload ? (
              <form className="panel" onSubmit={photo}>
                <fieldset disabled={busy}>
                  <label htmlFor="photo-file">Fotografia JPEG ou PNG (até 8 MB)</label>
                  <input
                    id="photo-file"
                    name="file"
                    type="file"
                    accept="image/jpeg,image/png"
                    required
                  />
                  <label htmlFor="photo-purpose">Finalidade da fotografia</label>
                  <select id="photo-purpose" name="purpose" defaultValue="OTHER">
                    {Object.entries(purposes).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="photo-caption">Legenda da fotografia (opcional)</label>
                  <input id="photo-caption" name="caption" maxLength={500} />
                  <p className="help">
                    O original é preservado em armazenamento privado. Fotografias sem GPS também
                    podem ser utilizadas.
                  </p>
                  <div className="form-actions">
                    <Button icon={Upload}>Enviar fotografia</Button>
                    <Button
                      icon={X}
                      type="button"
                      className="secondary"
                      onClick={() => setUpload(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </fieldset>
              </form>
            ) : null}
            <Button
              icon={RefreshCw}
              className="secondary"
              disabled={busy}
              onClick={() => {
                setRevision((v) => v + 1);
                onTechnicalChange();
              }}
            >
              Atualizar fotografias
            </Button>
            <ul className="photo-purpose-summary" aria-label="Fotografias por finalidade">
              {Object.entries(purposes).map(([key, label]) => (
                <li key={key}>
                  <strong>{label}</strong>
                  <span>
                    {data.photos.filter((photo) => (photo.purpose ?? 'OTHER') === key).length}{' '}
                    fotografia(s)
                  </span>
                </li>
              ))}
            </ul>
            {!data.photos.length ? (
              <p>Nenhuma fotografia cadastrada.</p>
            ) : (
              <ul className="work-list photo-list">
                {[...data.photos]
                  .sort(
                    (a, b) =>
                      Object.keys(purposes).indexOf(a.purpose ?? 'OTHER') -
                      Object.keys(purposes).indexOf(b.purpose ?? 'OTHER'),
                  )
                  .map((p) => (
                    <li key={p.id}>
                      <div>
                        <h3>{p.caption || purposes[p.purpose ?? ''] || 'Fotografia do furo'}</h3>
                        <p>{purposes[p.purpose ?? 'OTHER']}</p>
                        <p>
                          {p.processingState !== 'READY'
                            ? p.processingState === 'FAILED'
                              ? 'Fotografia não processada. Remova o arquivo e envie outra imagem.'
                              : 'Processando fotografia…'
                            : p.gpsLatitude === null
                              ? 'Fotografia sem GPS'
                              : p.distanceM === null
                                ? 'GPS disponível; falta uma coordenada oficial.'
                                : `Distância aproximada à referência oficial: ${p.distanceM.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} m`}
                        </p>
                        {p.gpsWarning ? (
                          <p className="notice">
                            GPS a mais de 10 m do furo. Confira a localização. A coordenada oficial
                            foi preservada.
                          </p>
                        ) : null}
                        {preview?.id === p.id ? (
                          <img
                            src={preview.url}
                            alt={p.caption || 'Fotografia do furo'}
                            className="photo-preview"
                          />
                        ) : null}
                      </div>
                      <div className="row-actions">
                        <Button
                          icon={Image}
                          className="secondary"
                          disabled={busy}
                          onClick={() => void show(p)}
                        >
                          Ver fotografia<span className="sr-only"> {p.caption}</span>
                        </Button>
                        {canWrite ? (
                          <>
                            <Button
                              icon={Pencil}
                              className="secondary"
                              disabled={busy}
                              onClick={() => setPhotoEditor(p)}
                            >
                              Editar fotografia<span className="sr-only"> {p.caption}</span>
                            </Button>
                            {remove === p.id ? (
                              <>
                                <p>Remover esta fotografia da seleção atual?</p>
                                <Button
                                  icon={Check}
                                  disabled={busy}
                                  onClick={() =>
                                    void perform(() =>
                                      auth.request(base + '/fotografias/' + p.id, {
                                        method: 'DELETE',
                                        body: JSON.stringify({ version: p.version }),
                                      }),
                                    )
                                  }
                                >
                                  Confirmar remoção
                                </Button>
                                <Button
                                  icon={X}
                                  className="secondary"
                                  disabled={busy}
                                  onClick={() => setRemove(null)}
                                >
                                  Cancelar remoção
                                </Button>
                              </>
                            ) : (
                              <Button
                                icon={Trash2}
                                className="secondary"
                                disabled={busy}
                                onClick={() => setRemove(p.id)}
                              >
                                Remover fotografia<span className="sr-only"> {p.caption}</span>
                              </Button>
                            )}
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
              </ul>
            )}
            {photoEditor ? (
              <form className="panel" key={photoEditor.id} onSubmit={savePhoto}>
                <fieldset disabled={busy}>
                  <legend>Legenda e recorte da fotografia</legend>
                  <label htmlFor="edit-photo-purpose">Finalidade</label>
                  <select
                    id="edit-photo-purpose"
                    name="purpose"
                    defaultValue={photoEditor.purpose ?? 'OTHER'}
                  >
                    {Object.entries(purposes).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <label htmlFor="edit-photo-caption">Legenda (opcional)</label>
                  <input
                    id="edit-photo-caption"
                    name="caption"
                    maxLength={500}
                    defaultValue={photoEditor.caption}
                  />
                  <p className="help">
                    Recorte em porcentagem da imagem: origem no canto superior esquerdo. Aplicado ao
                    relatório; o original permanece intacto.
                  </p>
                  {(['x', 'y', 'width', 'height'] as const).map((k) => (
                    <div key={k}>
                      <label htmlFor={'crop-' + k}>
                        {
                          {
                            x: 'Início horizontal (%)',
                            y: 'Início vertical (%)',
                            width: 'Largura (%)',
                            height: 'Altura (%)',
                          }[k]
                        }
                      </label>
                      <input
                        id={'crop-' + k}
                        name={k}
                        type="number"
                        required
                        min={k === 'x' || k === 'y' ? '0' : '0.01'}
                        max="100"
                        step="0.01"
                        defaultValue={photoEditor.crop[k] * 100}
                      />
                    </div>
                  ))}
                  <div className="form-actions">
                    <Button icon={Save}>Salvar legenda e recorte</Button>
                    <Button
                      icon={X}
                      className="secondary"
                      type="button"
                      onClick={() => setPhotoEditor(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </fieldset>
              </form>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
