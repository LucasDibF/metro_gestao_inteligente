import type { FormEvent, RefObject } from 'react';
import { Save, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { MetreDetails } from './MetreDetails';
import { MetreSoilFields } from './MetreSoilFields';
import { SptAdvances } from './SptAdvances';
import { defaultInterruptionReason } from './interruption-reason';
import { uniformSoilOf, type PreviousSoil } from './metre-soil';
import type { SptRecord } from './record-types';

function clearInterruption(form: HTMLFormElement | null): void {
  const reason = form?.elements.namedItem('reason');
  const ending = form?.elements.namedItem('ending');
  if (reason instanceof HTMLTextAreaElement) reason.value = '';
  if (ending instanceof HTMLInputElement) ending.checked = false;
}

/** Form that records or corrects one metre: blows, interruption and soil saved together. */
export function MetreEditor({
  current,
  initialSoil,
  formSequence,
  formRef,
  newMetreDepth,
  depthValue,
  previousSoil,
  busy,
  loading,
  onDepthChange,
  onSubmit,
  onCancel,
}: {
  current: SptRecord | null;
  initialSoil: boolean;
  formSequence: number;
  formRef: RefObject<HTMLFormElement | null>;
  newMetreDepth: string;
  depthValue: string;
  previousSoil: PreviousSoil | null;
  busy: boolean;
  loading: boolean;
  onDepthChange: (depth: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const uniformSoil = uniformSoilOf(current);
  return (
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
        onSubmit={onSubmit}
        aria-busy={busy}
      >
        <fieldset disabled={busy || loading}>
          <label htmlFor="spt-depth">Profundidade inicial do ensaio em metros</label>
          <input
            id="spt-depth"
            name="depth"
            type="number"
            min={current ? '0' : '1'}
            max="999999.99"
            step="0.01"
            required
            defaultValue={current?.depthM ?? newMetreDepth}
            readOnly={Boolean(current)}
            onChange={(e) => onDepthChange(e.target.value)}
            onBlur={(e) => {
              if (!current && Number(e.target.value) === 1) clearInterruption(e.target.form);
            }}
          />
          <p className="help">
            Informe a profundidade deste ensaio. Ela não altera a profundidade planejada do furo.
          </p>
          <MetreDetails value={current?.fieldDetails} />
          {initialSoil ? (
            <p className="notice">
              Primeiro metro (0–1 m): registre o solo e o método de execução. Não há golpes, avanços
              ou N-SPT neste intervalo.
            </p>
          ) : (
            <SptAdvances advances={current?.advances ?? []} />
          )}
          <p className="help">
            Deixe os avanços não executados vazios. Zero é um valor medido e não equivale a campo
            vazio.
          </p>
          <div hidden={initialSoil}>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="ending"
                defaultChecked={Boolean(current?.interruptionReason)}
                onChange={(e) => {
                  const reason = e.target.form?.elements.namedItem('reason');
                  if (
                    !e.target.checked &&
                    reason instanceof HTMLTextAreaElement &&
                    reason.value.trim() === defaultInterruptionReason
                  )
                    reason.value = '';
                }}
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
          <MetreSoilFields
            formRef={formRef}
            depthValue={depthValue}
            previousSoil={previousSoil}
            layered={Boolean(current && current.soil.length > 1 && !uniformSoil)}
            uniformSoil={uniformSoil}
          />
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
            <Button icon={X} className="secondary" type="button" onClick={onCancel}>
              Cancelar
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
