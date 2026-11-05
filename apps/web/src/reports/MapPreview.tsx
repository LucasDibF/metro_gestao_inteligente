import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import { RefreshCw, RotateCcw, Pencil, Save, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { auth } from '../auth/client';
interface View {
  centerX: number;
  centerY: number;
  spanM: number;
}
interface Preview {
  imagery?:
    | {
        state: 'ready';
        provider: 'esri';
        zoom: number;
        pixelSizeM: number;
        attribution: string;
      }
    | { state: 'ready'; provider?: 'inpe'; scene: string; date: string; pixelSizeM: number }
    | { state: 'unavailable'; reason: string }
    | { state: 'disabled' };
  google: { embedUrl: string | null; externalUrl: string } | null;
  version: number;
  map: { zone: number; hemisphere: string; view: View } | null;
  svg: string | null;
}
export function MapPreview({
  base,
  canWrite,
  reportVersion,
  onSaved,
  onError,
}: {
  base: string;
  canWrite: boolean;
  reportVersion: number;
  onSaved: () => void;
  onError: (e: unknown) => void;
}) {
  const errorRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Preview | null>(null),
    [image, setImage] = useState<string | null>(null),
    [editor, setEditor] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    auth
      .request<Preview>(base + '/croqui', {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
      })
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
      controller.abort();
    };
  }, [base, revision, onError]);
  useEffect(() => {
    if (!data?.svg) {
      setImage(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([data.svg], { type: 'image/svg+xml' }));
    setImage(url);
    return () => URL.revokeObjectURL(url);
  }, [data?.svg]);
  useEffect(() => {
    if (error && !busy) {
      errorRef.current?.focus({ preventScroll: true });
      errorRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [error, busy]);
  async function persist(view: View | null) {
    setBusy(true);
    setError('');
    try {
      await auth.request(base + '/croqui', {
        method: 'PUT',
        body: JSON.stringify({
          version: data?.version ?? reportVersion,
          view,
        }),
      });
      setEditor(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o croqui.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    void persist({
      centerX: Number(values.get('east')),
      centerY: Number(values.get('north')),
      spanM: Number(values.get('span')),
    });
  }
  return (
    <section className="map-preview" aria-labelledby="map-preview-title">
      <h4 id="map-preview-title">Croqui técnico</h4>
      {error ? (
        <div className="error" role="alert" ref={errorRef} tabIndex={-1}>
          <p>{error}</p>
          <Button
            icon={RefreshCw}
            className="secondary"
            disabled={busy}
            onClick={() => {
              setError('');
              setEditor(false);
              setRevision((v) => v + 1);
            }}
          >
            Recarregar croqui
          </Button>
          {canWrite ? (
            <Button
              icon={RotateCcw}
              className="secondary"
              disabled={busy}
              onClick={() => void persist(null)}
            >
              Restaurar enquadramento automático
            </Button>
          ) : null}
        </div>
      ) : null}
      {!data ? (
        error ? null : (
          <LoadingState>Carregando croqui…</LoadingState>
        )
      ) : data.map ? (
        <>
          <p className="help">
            O croqui abaixo usa imagem de satélite de alta resolução (Esri World Imagery) e, se ela
            faltar, a imagem gratuita do INPE. O PDF inclui a imagem, os furos e a escala. O Google
            Maps é apenas uma consulta de localização.
          </p>
          {data.google?.embedUrl ? (
            <iframe
              className="google-map-reference"
              title="Google Maps — referência de localização"
              src={data.google.embedUrl}
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          ) : (
            <p className="help">
              Google Maps não configurado. Preencha GOOGLE_MAPS_API_KEY no servidor para habilitar a
              visualização.
            </p>
          )}
          {data.google ? (
            <p>
              <a href={data.google.externalUrl} target="_blank" rel="noopener noreferrer">
                Abrir localização no Google Maps
              </a>
            </p>
          ) : null}
          {image ? (
            <img src={image} alt="Prévia do croqui com os furos selecionados em azul" />
          ) : null}
          {data.imagery?.state === 'ready' && data.imagery.provider === 'esri' ? (
            <p className="help">
              Imagem de satélite: {data.imagery.attribution} (Esri World Imagery) · resolução
              aproximada de {String(data.imagery.pixelSizeM).replace('.', ',')} m por pixel. Imagem
              recortada, reprojetada e reamostrada; a data da imagem varia por região e não
              representa levantamento cadastral.
            </p>
          ) : data.imagery?.state === 'ready' ? (
            <p className="help">
              Fonte: INPE / CBERS-4A · {data.imagery.date.split('-').reverse().join('/')} · pixel de{' '}
              {data.imagery.pixelSizeM} m. Imagem recortada, reprojetada e reamostrada; pode conter
              nuvens e não representa levantamento cadastral.{' '}
              <a
                href="https://creativecommons.org/licenses/by/4.0/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Licença CC BY 4.0
              </a>
              . Cena: {data.imagery.scene}.
            </p>
          ) : data.imagery?.state === 'unavailable' ? (
            <div role="status">
              <p>
                {data.imagery.reason === 'coverage'
                  ? 'Não foi encontrada imagem de satélite com cobertura útil para este enquadramento. Os furos permanecem no croqui técnico.'
                  : data.imagery.reason === 'extent'
                    ? 'Para carregar a imagem de satélite, ajuste a abrangência para até 1.500 m. O croqui técnico continua disponível.'
                    : 'Não foi possível carregar a imagem de satélite. O croqui técnico continua disponível.'}
              </p>
              <Button
                icon={RefreshCw}
                className="secondary"
                disabled={busy}
                onClick={() => setRevision((v) => v + 1)}
              >
                Tentar carregar imagem de satélite
              </Button>
            </div>
          ) : null}
          <p className="help">
            UTM {data.map.zone}
            {data.map.hemisphere}, SIRGAS2000. Furos do relatório em azul; referências em cinza.
          </p>
          {canWrite && !editor ? (
            <Button
              icon={Pencil}
              type="button"
              className="secondary"
              onClick={() => setEditor(true)}
            >
              Ajustar enquadramento
            </Button>
          ) : null}
          {editor ? (
            <form onSubmit={save}>
              <fieldset disabled={busy}>
                <label htmlFor="map-center-east">Centro do croqui — este (m)</label>
                <input
                  id="map-center-east"
                  name="east"
                  type="number"
                  required
                  min="-20000000"
                  max="20000000"
                  step="0.01"
                  defaultValue={data.map.view.centerX.toFixed(2)}
                />
                <label htmlFor="map-center-north">Centro do croqui — norte (m)</label>
                <input
                  id="map-center-north"
                  name="north"
                  type="number"
                  required
                  min="-20000000"
                  max="20000000"
                  step="0.01"
                  defaultValue={data.map.view.centerY.toFixed(2)}
                />
                <label htmlFor="map-span">Abrangência do croqui em metros</label>
                <input
                  id="map-span"
                  name="span"
                  type="number"
                  required
                  min="1"
                  max="20000000"
                  step="0.01"
                  defaultValue={data.map.view.spanM.toFixed(2)}
                />
                <p className="help">
                  O enquadramento precisa mostrar todos os furos selecionados. Salvar cria uma nova
                  versão da composição.
                </p>
                <div className="form-actions">
                  <Button icon={Save}>Salvar enquadramento</Button>
                  <Button type="button" className="secondary" onClick={() => void persist(null)}>
                    Usar enquadramento automático
                  </Button>
                  <Button
                    icon={X}
                    type="button"
                    className="secondary"
                    onClick={() => setEditor(false)}
                  >
                    Cancelar
                  </Button>
                </div>
              </fieldset>
            </form>
          ) : null}
        </>
      ) : (
        <p>Cadastre uma coordenada oficial nos furos selecionados para visualizar o croqui.</p>
      )}
    </section>
  );
}
