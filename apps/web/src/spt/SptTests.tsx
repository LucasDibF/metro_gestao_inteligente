import { classifySoilState, formatSoilDescription } from './soil-state';
import { SoilStateText } from './SoilState';
import { FuroNavigation, type FuroSection } from './FuroNavigation';
import { canRecordField } from '../auth/permissions';
import { hasRole } from '../auth/permissions';
import { MetreDetails, methods, recoveries, type FieldDetails } from './MetreDetails';
import { LoadingState } from '../ui/LoadingState';
import { Button } from '../ui/Button';
import { ArrowLeft, Plus, X, Save, Pencil, ArrowRight } from 'lucide-react';
import { SptAdvances } from './SptAdvances';
import type { Identification } from './BoreholeIdentification';
import { FieldSubmission } from './FieldSubmission';
import { TechnicalDetails } from './TechnicalDetails';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { auth, type Profile } from '../auth/client';
interface Advance {
  blows: number;
  penetrationMm: number;
}
interface Result {
  status: 'NOT_TESTED' | 'CONVENTIONAL' | 'INCOMPLETE' | 'INTERRUPTED' | 'REQUIRES_REVIEW';
  nSpt: number | null;
  reason: string;
}
interface Record {
  id: string;
  depthM: string;
  advances: Advance[];
  fieldDetails?: FieldDetails | null;
  interruptionReason: string | null;
  result: Result;
  version: number;
  soil: Array<{
    id: string;
    fromM: string;
    toM: string;
    soilType: string;
    description: string;
    soilColor?: string | null;
    soilMoisture?: string | null;
  }>;
}
interface Page {
  reviewState: string;
  navigation: Array<{ id: string; depthM: string }>;
  nextDepth: string;
  technicalVersion: number;
  items: Record[];
  total: number;
  page: number;
  pageSize: number;
}
const labels = {
  NOT_TESTED: 'Primeiro metro · registro de solo, sem ensaio SPT',
  CONVENTIONAL: 'Cálculo convencional',
  INCOMPLETE: 'Ensaio incompleto',
  INTERRUPTED: 'Ensaio interrompido',
  REQUIRES_REVIEW: 'Revisão técnica necessária',
};
export function SptTests({
  workId,
  workName,
  hole: initialHole,
  profile,
  onBack,
  onError,
  onEditingChange,
  onIdentificationChanged,
}: {
  workId: string;
  workName: string;
  hole: { id: string; code: string };
  profile: Profile;
  onBack: () => void;
  onError: (error: unknown) => void;
  onEditingChange?: (editing: boolean) => void;
  onIdentificationChanged?: (saved: Identification) => void;
}) {
  const [hole, setHole] = useState(initialHole);
  const [section, setSection] = useState<FuroSection>(
    hasRole(profile, 'OPERATOR') ? 'field' : 'overview',
  );
  const details = section !== 'field';
  const setDetails = (value: boolean) => setSection(value ? 'overview' : 'field');
  const [nextDepth, setNextDepth] = useState('1');
  const [formSequence, setFormSequence] = useState(0);
  const [depthValue, setDepthValue] = useState('1');
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [errorAttempt, setErrorAttempt] = useState(0);
  const [data, setData] = useState<Page | null>(null);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submissionEditing, setSubmissionEditing] = useState(false);
  const [editing, setEditing] = useState<Record | 'new' | null>(null);
  const [result, setResult] = useState<Record | null>(null);
  useEffect(() => {
    onEditingChange?.(Boolean(editing) || submissionEditing);
    return () => onEditingChange?.(false);
  }, [editing, submissionEditing, onEditingChange]);
  const base = `/obras/${workId}/furos/${hole.id}/ensaios`;
  const initialSoil =
    Number(depthValue) === 1 &&
    (!editing || editing === 'new' || editing.result.status === 'NOT_TESTED');
  const [previousSoil, setPreviousSoil] = useState<{
    soilType: string;
    soilColor?: string | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    setPreviousSoil(null);
    if (editing && Number(depthValue) > 1)
      auth
        .request<{ record: Record | null }>(`${base}/metro?depth=${Number(depthValue) - 1}`)
        .then(({ record }) => {
          if (active) setPreviousSoil(record?.soil.at(-1) ?? null);
        })
        .catch((e) => {
          if (active) onError(e);
        });
    return () => {
      active = false;
    };
  }, [base, depthValue, editing, revision, onError]);
  const canWrite = canRecordField(profile, data?.reviewState);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    auth
      .request<Page>(`${base}?page=${page}`)
      .then((value) => {
        if (active) {
          setData(value);
          if (!formRef.current) {
            setNextDepth(value.nextDepth);
            setDepthValue(value.nextDepth);
          }
        }
      })
      .catch((error) => {
        if (active) {
          setError(
            error instanceof Error ? error.message : 'Não foi possível carregar os ensaios.',
          );
          onError(error);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [base, page, revision, onError]);
  useEffect(() => {
    if (error && !busy) {
      errorRef.current?.focus({ preventScroll: true });
      errorRef.current?.scrollIntoView({ block: 'center' });
    }
  }, [error, busy, errorAttempt]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorAttempt((v) => v + 1);
    const current = editing;
    if (!current || !data || loading) return;
    const values = new FormData(event.currentTarget);
    setError('');
    setMessage('');
    const advances: Advance[] = [];
    let trailing = false;
    for (let i = 0; i < 3; i++) {
      const blows = String(values.get(`blows-${i}`) ?? '').trim();
      const penetration = String(values.get(`penetration-${i}`) ?? '').trim();
      if (!blows && !penetration) {
        trailing = true;
        continue;
      }
      if (trailing || !blows || !penetration) {
        setError(
          'Preencha golpes e penetração na ordem dos avanços. Deixe os avanços não executados completamente vazios.',
        );
        return;
      }
      if (!/^\d+$/.test(blows) || !/^\d+(\.\d)?$/.test(penetration)) {
        setError('Informe golpes inteiros e penetração em centímetros com até uma casa decimal.');
        return;
      }
      const [whole, fraction = '0'] = penetration.split('.');
      const penetrationMm = Number(whole) * 10 + Number(fraction);
      if (!Number.isSafeInteger(Number(blows)) || !Number.isSafeInteger(penetrationMm)) {
        setError('Os valores informados estão fora do intervalo aceito.');
        return;
      }
      advances.push({ blows: Number(blows), penetrationMm });
    }
    const next = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'next';
    const reason =
      String(values.get('reason') ?? '').trim() ||
      (values.get('ending') === 'on' ? 'Encerramento registrado em campo' : null);
    setBusy(true);
    try {
      const saved = await auth.request<Record>(current === 'new' ? base : `${base}/${current.id}`, {
        method: current === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify({
          depthM: String(values.get('depth')),
          advances,
          ...(initialSoil ? { recordType: 'INITIAL_SOIL' } : {}),
          soil: {
            soilType: String(values.get('soilType')),
            description: String(values.get('soilDescription')),
            soilColor: String(values.get('soilColor')) || null,
            soilMoisture: String(values.get('soilMoisture')) || null,
          },
          fieldDetails: {
            executionMethod: String(values.get('executionMethod')) || null,
            sampleRecovery: String(values.get('sampleRecovery')) || null,
          },
          technicalVersion: data.technicalVersion,
          interruptionReason: reason,
          ...(current === 'new' ? {} : { version: current.version }),
        }),
      });
      const following = String(Number(values.get('depth')) + 1);
      setNextDepth(following);
      setDepthValue(following);
      setFormSequence((v) => v + 1);
      if (next) {
        try {
          const { record: existing } = await auth.request<{ record: Record | null }>(
            `${base}/metro?depth=${following}`,
          );
          setEditing(existing ?? 'new');
        } catch (e) {
          setEditing(null);
          onError(e);
        }
      } else setEditing(null);
      setResult(saved);
      setMessage('Ensaio e descrição do solo salvos juntos.');
      if (next)
        requestAnimationFrame(() => {
          formRef.current?.querySelector<HTMLInputElement>('input')?.focus();
        });
      setPage(1);
      setRevision((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível salvar.');
      onError(error);
    } finally {
      setBusy(false);
    }
  }
  async function openMetre(depth: string) {
    if (editing || submissionEditing) return;
    setBusy(true);
    setError('');
    try {
      const [{ record }, fresh] = await Promise.all([
        auth.request<{ record: Record | null }>(`${base}/metro?depth=${depth}`),
        auth.request<Page>(base + '?page=1'),
      ]);
      setData(fresh);
      setDepthValue(depth);
      setNextDepth(depth);
      setFormSequence((v) => v + 1);
      setEditing(record ?? 'new');
      setResult(null);
      setMessage('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível abrir o metro.');
      onError(e);
    } finally {
      setBusy(false);
    }
  }
  const current = editing && editing !== 'new' ? editing : null;
  const uniformSoil =
    current?.soil.length &&
    current.soil.every(
      (layer) =>
        layer.soilType === current.soil[0].soilType &&
        layer.description === current.soil[0].description &&
        layer.soilColor === current.soil[0].soilColor &&
        layer.soilMoisture === current.soil[0].soilMoisture,
    )
      ? current.soil[0]
      : null;
  if (details)
    return (
      <TechnicalDetails
        workId={workId}
        workName={workName}
        hole={hole}
        profile={profile}
        onError={onError}
        mode={section as Exclude<FuroSection, 'field'>}
        navigation={
          <FuroNavigation
            profile={profile}
            section={section}
            onChange={(next) => {
              setSection(next);
              setRevision((value) => value + 1);
            }}
          />
        }
        onEditMetre={
          canWrite
            ? (depth) => {
                setDetails(false);
                void openMetre(depth);
              }
            : undefined
        }
        onBack={onBack}
        onEditingChange={onEditingChange}
        onEditIdentification={() => setSection('identification')}
        onIdentificationSaved={(saved) => {
          setHole(saved);
          onIdentificationChanged?.(saved);
          setRevision((v) => v + 1);
        }}
      />
    );
  return (
    <section className="spt-screen" aria-labelledby="spt-title">
      <Button
        icon={ArrowLeft}
        className="secondary"
        disabled={busy || Boolean(editing) || submissionEditing}
        onClick={onBack}
      >
        Voltar aos furos
      </Button>
      <div className="section-heading">
        <div>
          <h2 id="spt-title">Registro de campo · {hole.code}</h2>
          <p className="spt-work-context">
            {workName} · Preencha golpes e solo juntos, metro a metro.
          </p>
        </div>
        {canWrite && !editing && !submissionEditing && data && !loading ? (
          <Button
            icon={Plus}
            onClick={() => {
              setDepthValue(nextDepth);
              setEditing('new');
              setResult(null);
              setError('');
              setMessage('');
            }}
          >
            Registrar metro
          </Button>
        ) : null}
      </div>
      <FuroNavigation
        profile={profile}
        section={section}
        onChange={(next) => {
          setSection(next);
          setRevision((value) => value + 1);
        }}
        disabled={busy || Boolean(editing) || submissionEditing}
      />
      {data && !canWrite && hasRole(profile, 'OPERATOR') ? (
        <p className="notice">
          Registro enviado para análise. As alterações ficam bloqueadas até o engenheiro devolver
          para correção.
        </p>
      ) : null}
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <div className="error" role="alert" ref={errorRef} tabIndex={-1}>
          <p>{error}</p>
          <Button
            icon={X}
            className="secondary"
            disabled={busy}
            onClick={() => {
              setEditing(null);
              setResult(null);
              setRevision((value) => value + 1);
            }}
          >
            {editing ? 'Fechar edição e recarregar' : 'Recarregar ensaios'}
          </Button>
        </div>
      ) : null}
      {data && !editing && canWrite ? (
        <nav className="metre-navigation" aria-label="Navegação por metro">
          <label htmlFor="metre-jump">Reabrir metro para edição</label>
          <div className="search-controls">
            <select
              id="metre-jump"
              value=""
              disabled={busy || submissionEditing}
              onChange={(e) => void openMetre(e.target.value)}
            >
              <option value="">Selecione a profundidade</option>
              {data.navigation.map((item) => (
                <option key={item.id} value={item.depthM}>
                  {Number(item.depthM).toLocaleString('pt-BR')} m — salvo
                </option>
              ))}
              <option value={data.nextDepth}>
                {Number(data.nextDepth).toLocaleString('pt-BR')} m — novo
              </option>
            </select>
          </div>
          <p className="help">
            A lista abaixo permanece em consulta. Escolha um metro ou use Corrigir registro para
            reabrir; salve ou cancele antes de mudar de profundidade.
          </p>
        </nav>
      ) : null}
      {editing ? (
        <section className="panel spt-editor" aria-labelledby="spt-form-title">
          <h3 id="spt-form-title">
            {initialSoil
              ? 'Primeiro metro: solo e método'
              : current
                ? 'Corrigir registro: ensaio e solo'
                : 'Novo metro: ensaio e solo'}
          </h3>
          <form
            key={current ? `${current.id}-${current.version}` : `new-${formSequence}`}
            ref={formRef}
            onSubmit={save}
            aria-busy={busy}
          >
            <fieldset disabled={busy || loading}>
              <label htmlFor="spt-depth">Profundidade inicial do ensaio em metros</label>
              <input
                id="spt-depth"
                name="depth"
                type="number"
                min="0"
                max="999999.99"
                step="0.01"
                required
                defaultValue={current?.depthM ?? nextDepth}
                readOnly={Boolean(current)}
                onChange={(e) => setDepthValue(e.target.value)}
              />
              <p className="help">
                Informe a profundidade deste ensaio. Ela não altera a profundidade planejada do
                furo.
              </p>
              <MetreDetails value={current?.fieldDetails} />
              {initialSoil ? (
                <p className="notice">
                  Primeiro metro (0–1 m): registre o solo e o método de execução. Não há golpes,
                  avanços ou N-SPT neste intervalo.
                </p>
              ) : (
                <SptAdvances advances={current?.advances ?? []} />
              )}
              <p className="help">
                Deixe os avanços não executados vazios. Zero é um valor medido e não equivale a
                campo vazio.
              </p>
              <div hidden={initialSoil}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="ending"
                    defaultChecked={Boolean(current?.interruptionReason)}
                  />
                  Último metro do furo
                </label>
                <p className="help">
                  Marque ao encerrar a execução. Os avanços seguintes podem ficar vazios; não serão
                  transformados em zero.
                </p>
                <label htmlFor="spt-reason">Motivo de interrupção (opcional)</label>
                <textarea
                  id="spt-reason"
                  name="reason"
                  rows={3}
                  maxLength={500}
                  defaultValue={current?.interruptionReason ?? ''}
                />
              </div>
              <fieldset className="spt-advance">
                <legend>Solo deste metro</legend>
                {Number(depthValue) > 1 ? (
                  <Button
                    type="button"
                    className="secondary"
                    disabled={!previousSoil}
                    onClick={() => {
                      const soil = formRef.current?.elements.namedItem(
                        'soilType',
                      ) as HTMLInputElement | null;
                      const color = formRef.current?.elements.namedItem(
                        'soilColor',
                      ) as HTMLInputElement | null;
                      if (previousSoil && soil && color) {
                        soil.value = previousSoil.soilType;
                        color.value = previousSoil.soilColor ?? '';
                      }
                    }}
                  >
                    Repetir tipo e cor do metro anterior
                  </Button>
                ) : null}
                <p className="help">
                  Intervalo no perfil: {Math.max(0, Number(depthValue) - 1).toLocaleString('pt-BR')}{' '}
                  a {Number(depthValue) === 0 ? '1' : Number(depthValue).toLocaleString('pt-BR')} m.
                  O solo é informado em campo; não é calculado pelos golpes.
                </p>
                {current && current.soil.length > 1 && !uniformSoil ? (
                  <p className="help">
                    Este metro contém mais de uma camada. Ao salvar, a descrição informada
                    substituirá somente o intervalo indicado; os trechos vizinhos serão preservados.
                  </p>
                ) : null}
                <label htmlFor="metre-soil">Tipo de solo</label>
                <input
                  id="metre-soil"
                  name="soilType"
                  list="spt-soil-types"
                  required
                  maxLength={120}
                  defaultValue={uniformSoil?.soilType ?? ''}
                />
                <datalist id="spt-soil-types">
                  {[
                    'Areia fina',
                    'Areia fina argilosa',
                    'Areia fina siltosa',
                    'Areia média argilosa',
                    'Areia média siltosa',
                    'Areia grossa argilosa',
                    'Areia grossa siltosa',
                    'Areia fina a média',
                    'Areia média',
                    'Areia média a grossa',
                    'Areia grossa',
                    'Areia siltosa',
                    'Areia argilosa',
                    'Argila arenosa',
                    'Argila siltosa',
                    'Argila silto-arenosa',
                    'Silte argiloso',
                    'Silte arenoso',
                  ].map((soil) => (
                    <option key={soil} value={soil} />
                  ))}
                </datalist>
                <div className="field-pair">
                  <div>
                    <label htmlFor="metre-color">Cor do solo</label>
                    <input
                      id="metre-color"
                      name="soilColor"
                      list="soil-colors"
                      maxLength={120}
                      defaultValue={uniformSoil?.soilColor ?? ''}
                    />
                    <datalist id="soil-colors">
                      {[
                        'Marrom',
                        'Cinza',
                        'Avermelhado',
                        'Amarelado',
                        'Esbranquiçado',
                        'Preto',
                      ].map((value) => (
                        <option key={value} value={value} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label htmlFor="metre-moisture">Umidade do solo</label>
                    <select
                      id="metre-moisture"
                      name="soilMoisture"
                      defaultValue={uniformSoil?.soilMoisture ?? ''}
                    >
                      <option value="">Não informada</option>
                      {['Seca', 'Úmida', 'Saturada'].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <label htmlFor="metre-description">Descrição do solo (opcional)</label>
                <textarea
                  id="metre-description"
                  name="soilDescription"
                  placeholder="Descreva cor, umidade, textura e demais características observadas em campo."
                  maxLength={2000}
                  rows={3}
                  defaultValue={uniformSoil?.description ?? ''}
                />
              </fieldset>
              <p className="help">
                Um único salvamento grava o registro e o solo. Se houver erro, nenhum dos dois será
                alterado.
              </p>
              <div className="form-actions">
                <Button icon={Save} loading={busy} type="submit">
                  {busy ? 'Salvando…' : 'Salvar metro'}
                </Button>
                <Button icon={Save} type="submit" className="secondary" name="action" value="next">
                  Salvar e próximo metro
                </Button>
                <Button
                  icon={X}
                  className="secondary"
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  Cancelar
                </Button>
              </div>
            </fieldset>
          </form>
        </section>
      ) : null}
      {result ? (
        <section className="panel spt-result" aria-labelledby="spt-result-title">
          <h3 id="spt-result-title">Resultado do ensaio</h3>
          <p>
            <strong>{labels[result.result.status]}</strong>
          </p>
          <p>
            N-SPT:{' '}
            <strong>{result.result.nSpt === null ? 'Não calculado' : result.result.nSpt}</strong>
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
      ) : null}
      {loading ? (
        <LoadingState>Carregando ensaios…</LoadingState>
      ) : data?.items.length ? (
        <>
          <ul className="work-list">
            {data.items.map((record) => (
              <li key={record.id}>
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
                      · Recuperação:{' '}
                      {record.fieldDetails.sampleRecovery
                        ? recoveries[record.fieldDetails.sampleRecovery]
                        : 'não informada'}
                    </p>
                  ) : null}
                  {record.interruptionReason ? (
                    <p>Interrupção: {record.interruptionReason}</p>
                  ) : null}
                </div>
                {canWrite ? (
                  <Button
                    icon={Pencil}
                    className="secondary"
                    disabled={busy || Boolean(editing) || submissionEditing}
                    onClick={() => {
                      setDepthValue(record.depthM);
                      setEditing(record);
                      setResult(null);
                      setError('');
                      setMessage('');
                    }}
                  >
                    Corrigir registro
                    <span className="sr-only">
                      {' '}
                      a {Number(record.depthM).toLocaleString('pt-BR')} m
                    </span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          <nav className="pagination" aria-label="Páginas de ensaios">
            <Button
              icon={ArrowLeft}
              className="secondary"
              disabled={busy || submissionEditing || Boolean(editing) || page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </Button>
            <span>Página {page}</span>
            <Button
              icon={ArrowRight}
              className="secondary"
              disabled={busy || submissionEditing || Boolean(editing) || page * 20 >= data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </Button>
          </nav>
        </>
      ) : !error ? (
        <div className="empty">
          <h3>Nenhum ensaio registrado</h3>
          <p>Os ensaios deste furo aparecerão aqui.</p>
        </div>
      ) : null}
      {data && !editing ? (
        <Button
          className="secondary"
          disabled={busy || submissionEditing}
          onClick={() => {
            setSection('photos');
            setRevision((v) => v + 1);
          }}
        >
          Continuar para fotografias
        </Button>
      ) : null}
      {data && hasRole(profile, 'ENGINEER', 'OPERATOR') && !editing ? (
        <FieldSubmission
          key={revision}
          workId={workId}
          boreholeId={hole.id}
          onError={onError}
          onSubmitted={() => setRevision((value) => value + 1)}
          onEditingChange={setSubmissionEditing}
        />
      ) : null}
    </section>
  );
}
