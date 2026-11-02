import { SoilStateReference } from '../SoilStateReference';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, FileSearch, Minus, Plus, RefreshCw, Scan } from 'lucide-react';
import { Button } from '../../ui/Button';
import { LoadingState } from '../../ui/LoadingState';
import { auth } from '../../auth/client';
import { AnalysisProfile } from './AnalysisProfile';
import { profileExtent } from './profile-model';
import { SheetInspector } from './SheetInspector';
import { number, type SheetData, type SheetLayer, type SheetSelection } from './types';
export function InteractiveSheet({
  workId,
  boreholeId,
  technicalVersion,
  refreshKey,
  onError,
  onEditMetre,
  onEditLayer,
  editDisabled = false,
  onReload,
}: {
  workId: string;
  boreholeId: string;
  technicalVersion: number;
  refreshKey: number;
  onError: (e: unknown) => void;
  onEditMetre?: (depth: string) => void;
  onEditLayer?: (layer: SheetLayer) => void;
  editDisabled?: boolean;
  onReload: () => void;
}) {
  const [data, setData] = useState<SheetData | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(0),
    [selection, setSelection] = useState<SheetSelection>(null),
    [zoom, setZoom] = useState(1),
    [fit, setFit] = useState(() => !matchMedia('(max-width:760px)').matches),
    [fitScale, setFitScale] = useState(1),
    [mobileTab, setMobileTab] = useState('sheet'),
    [showFirst, setShowFirst] = useState(true),
    [showFinal, setShowFinal] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const base = `/obras/${workId}/furos/${boreholeId}`;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    auth
      .request<SheetData>(base + '/tecnico/analise')
      .then((result) => {
        if (active) {
          setData(result);
          setPage((value) => Math.min(value, Math.ceil(profileExtent(result) / 20) - 1));
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          onError(e);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, technicalVersion, revision, refreshKey]);
  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => setFitScale(Math.min(1, Math.max(0.2, (node.clientWidth - 24) / 940)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [Boolean(data), mobileTab]);
  const select = useCallback((value: SheetSelection) => {
    setSelection(value);
    if (value && matchMedia('(max-width:1200px)').matches) setMobileTab('details');
  }, []);
  const scale = fit ? fitScale : zoom;
  const extent = data ? profileExtent(data) : 1;
  const count = Math.ceil(extent / 20);
  const from = page * 20;
  const to = Math.min(from + 20, Math.ceil(extent));
  function changeZoom(delta: number) {
    setZoom(Math.min(2, Math.max(0.2, Math.round((scale + delta) * 100) / 100)));
    setFit(false);
  }
  function refresh() {
    setRevision((value) => value + 1);
    onReload();
  }
  function openDepth(depth: string) {
    setPage(Math.min(count - 1, Math.max(0, Math.ceil(Number(depth) / 20) - 1)));
    select({ kind: 'test', depth });
  }
  return (
    <section className="interactive-sheet" aria-labelledby="interactive-sheet-title">
      <div className="section-heading">
        <div>
          <h3 id="interactive-sheet-title">
            <FileSearch aria-hidden="true" />
            Análise do furo
          </h3>
          <p className="help">
            Explore a execução metro a metro: camadas, resistência e condições de campo na mesma
            escala de profundidade.
          </p>
        </div>
        <Button icon={RefreshCw} className="secondary" disabled={loading} onClick={refresh}>
          Atualizar análise
        </Button>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {loading && !data ? <LoadingState>Preparando perfil…</LoadingState> : null}
      {data ? (
        <>
          <p className="help">
            Versão técnica {data.technicalVersion} · {data.hole.code}
            {loading ? ' · Atualizando…' : ''}
          </p>
          {data.warnings.length ? (
            <details className="sheet-warnings">
              <summary>Pendências e informações da conferência ({data.warnings.length})</summary>
              <ul>
                {data.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
          <div className="sheet-toolbar" aria-label="Controles do perfil">
            <Button
              icon={ArrowLeft}
              className="secondary"
              disabled={page === 0}
              aria-label="Trecho anterior"
              onClick={() => setPage((value) => value - 1)}
            />
            <label className="sr-only" htmlFor="sheet-page">
              Trecho de profundidade
            </label>
            <select
              id="sheet-page"
              value={page}
              onChange={(e) => {
                setPage(Number(e.target.value));
                setSelection(null);
              }}
            >
              {Array.from({ length: count }, (_, index) => (
                <option key={index} value={index}>
                  {index * 20}–{Math.min(index * 20 + 20, Math.ceil(extent))} m
                </option>
              ))}
            </select>
            <Button
              icon={ArrowRight}
              className="secondary"
              disabled={page === count - 1}
              aria-label="Próximo trecho"
              onClick={() => setPage((value) => value + 1)}
            />
            <span className="sheet-toolbar-divider" />
            <Button
              icon={Minus}
              className="secondary"
              aria-label="Diminuir zoom do perfil"
              disabled={scale <= 0.2}
              onClick={() => changeZoom(-0.1)}
            />
            <span aria-label="Zoom do perfil">{Math.round(scale * 100)}%</span>
            <Button
              icon={Plus}
              className="secondary"
              aria-label="Aumentar zoom do perfil"
              disabled={scale >= 2}
              onClick={() => changeZoom(0.1)}
            />
            <Button icon={Scan} className="secondary" onClick={() => setFit(true)}>
              Ajustar à largura
            </Button>
          </div>
          <div className="analysis-legend" aria-label="Séries do gráfico">
            <button
              type="button"
              className="analysis-legend-first"
              aria-pressed={showFirst}
              onClick={() => setShowFirst((value) => !value)}
            >
              <span />
              1º + 2º avanço
            </button>
            <button
              type="button"
              className="analysis-legend-final"
              aria-pressed={showFinal}
              onClick={() => setShowFinal((value) => !value)}
            >
              <span />
              2º + 3º · N-SPT
            </button>
          </div>
          <SoilStateReference />
          <div className="sheet-mobile-nav">
            <Button
              className={mobileTab === 'sheet' ? '' : 'secondary'}
              onClick={() => setMobileTab('sheet')}
            >
              Ver perfil
            </Button>
            <Button
              className={mobileTab === 'details' ? '' : 'secondary'}
              onClick={() => setMobileTab('details')}
            >
              Ver detalhes
            </Button>
          </div>
          <dl className="analysis-field-strip">
            <div>
              <dt>Nível d’água</dt>
              <dd>
                {data.hole.waterLevelM === null
                  ? 'Não informado'
                  : `${number(data.hole.waterLevelM)} m`}
              </dd>
            </div>
            <div>
              <dt>Encerramento medido</dt>
              <dd>
                {data.tests.length || data.hole.executedDepthM !== null
                  ? `${number(data.termination.depth)} m`
                  : 'Não informado'}
              </dd>
            </div>
            <div>
              <dt>Lavagem por tempo</dt>
              <dd>Sem registro no cadastro atual</dd>
            </div>
          </dl>
          <div className="sheet-workspace" data-mobile-tab={mobileTab}>
            <div className="sheet-paper-panel">
              <p className="help">
                Selecione uma camada, leitura ou ponto da curva. No celular, deslize horizontalmente
                para explorar as colunas ou ajuste à largura para uma visão geral.
              </p>
              <div
                className="sheet-viewport"
                ref={viewport}
                role="region"
                aria-label="Perfil geotécnico com zoom e rolagem"
                tabIndex={0}
              >
                <AnalysisProfile
                  data={data}
                  from={from}
                  to={to}
                  scale={scale}
                  selection={selection}
                  onSelect={select}
                  showFirst={showFirst}
                  showFinal={showFinal}
                />
              </div>
            </div>
            <aside className="sheet-inspector" aria-label="Detalhes da análise selecionada">
              <label htmlFor="sheet-depth">Consultar metro</label>
              <select
                id="sheet-depth"
                value={selection?.kind === 'test' ? selection.depth : ''}
                onChange={(e) => e.target.value && openDepth(e.target.value)}
              >
                <option value="">Selecione um registro</option>
                {data.tests.map((test) => (
                  <option key={test.id} value={test.depthM}>
                    {number(test.depthM)} m
                  </option>
                ))}
              </select>
              <label htmlFor="sheet-layer">Consultar camada</label>
              <select
                id="sheet-layer"
                value={selection?.kind === 'layer' ? `${selection.from}|${selection.to}` : ''}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [from, to] = e.target.value.split('|');
                  setPage(Math.min(count - 1, Math.floor(Number(from) / 20)));
                  select({ kind: 'layer', from, to });
                }}
              >
                <option value="">Selecione um intervalo</option>
                {data.layers.map((layer) => (
                  <option key={layer.id} value={`${layer.fromM}|${layer.toM}`}>
                    {number(layer.fromM)}–{number(layer.toM)} m · {layer.soilType}
                  </option>
                ))}
              </select>
              <SheetInspector
                data={data}
                selection={selection}
                onSelect={select}
                onEditMetre={onEditMetre}
                onEditLayer={onEditLayer}
                editDisabled={editDisabled}
                base={base + '/arquivos'}
                onError={onError}
              />
            </aside>
          </div>
        </>
      ) : null}
    </section>
  );
}
