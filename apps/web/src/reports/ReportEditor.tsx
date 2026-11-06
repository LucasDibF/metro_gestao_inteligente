import { useState, type FormEvent } from 'react';
import { ArrowUp, ArrowDown, X, Save } from 'lucide-react';
import { Button } from '../ui/Button';
import type { CompositionInput, Hole, Report } from './report-types';

function swap(ids: string[], index: number, direction: number): string[] {
  const next = [...ids];
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return next;
}

/** Composition form: title, notes, ordered boreholes and photographs of one report. */
export function ReportEditor({
  current,
  options,
  total,
  busy,
  onLoadMore,
  onSave,
  onCancel,
}: {
  current: Report | null;
  options: Hole[];
  total: number;
  busy: boolean;
  onLoadMore: () => void;
  onSave: (input: CompositionInput) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(current?.composition.holeIds ?? []),
    [photos, setPhotos] = useState<string[]>(current?.composition.photoIds ?? []);
  const availablePhotos = options
    .filter((h) => selected.includes(h.id))
    .flatMap((h) => h.photos.map((p) => ({ ...p, code: h.code })));
  function removeHole(id: string) {
    const photoIds = new Set(options.find((h) => h.id === id)?.photos.map((p) => p.id) ?? []);
    setSelected((value) => value.filter((holeId) => holeId !== id));
    setPhotos((value) => value.filter((photoId) => !photoIds.has(photoId)));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    onSave({
      title: String(values.get('title')),
      notes: String(values.get('notes')),
      holeIds: selected,
      photoIds: photos,
      showOtherBoreholes: values.get('others') === 'on',
    });
  }
  return (
    <form className="panel" onSubmit={submit}>
      <fieldset disabled={busy}>
        <legend>{current ? 'Editar composição' : 'Novo relatório'}</legend>
        <label htmlFor="report-title">Título do relatório</label>
        <input
          id="report-title"
          name="title"
          required
          maxLength={200}
          defaultValue={current?.title ?? 'Relatório de sondagem SPT'}
        />
        <label htmlFor="report-notes">Observações do relatório (opcional)</label>
        <textarea
          id="report-notes"
          name="notes"
          rows={3}
          maxLength={4000}
          defaultValue={current?.notes ?? ''}
        />
        <h3>Furos da obra</h3>
        <p className="help">Selecione até 20 furos. A ordem selecionada será usada no relatório.</p>
        {options.map((h) => (
          <label className="checkbox-label" key={h.id}>
            <input
              type="checkbox"
              checked={selected.includes(h.id)}
              onChange={(e) => {
                if (e.target.checked) setSelected((v) => [...v, h.id]);
                else removeHole(h.id);
              }}
            />
            {h.code}
          </label>
        ))}
        {options.length < total ? (
          <Button type="button" className="secondary" onClick={onLoadMore}>
            Carregar mais furos para seleção
          </Button>
        ) : null}
        {selected.length ? (
          <ol className="selection-order">
            {selected.map((id, i) => (
              <li key={id}>
                <span>{options.find((h) => h.id === id)?.code ?? 'Furo indisponível'}</span>
                <div className="row-actions">
                  <Button
                    icon={ArrowUp}
                    type="button"
                    className="secondary"
                    disabled={i === 0}
                    onClick={() => setSelected(swap(selected, i, -1))}
                  >
                    Subir
                    <span className="sr-only"> furo {options.find((h) => h.id === id)?.code}</span>
                  </Button>
                  <Button
                    icon={ArrowDown}
                    type="button"
                    className="secondary"
                    disabled={i === selected.length - 1}
                    onClick={() => setSelected(swap(selected, i, 1))}
                  >
                    Descer
                    <span className="sr-only"> furo {options.find((h) => h.id === id)?.code}</span>
                  </Button>
                  <Button
                    icon={X}
                    type="button"
                    className="secondary"
                    onClick={() => removeHole(id)}
                  >
                    Retirar
                    <span className="sr-only"> furo {options.find((h) => h.id === id)?.code}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        <h3>Fotografias</h3>
        <p className="help">Selecione até 40 fotografias dos furos incluídos.</p>
        {availablePhotos.length ? (
          availablePhotos.map((p) => (
            <label key={p.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={photos.includes(p.id)}
                onChange={(e) =>
                  setPhotos((v) =>
                    e.target.checked ? [...v, p.id] : v.filter((id) => id !== p.id),
                  )
                }
              />
              {p.code} · {p.caption}
            </label>
          ))
        ) : (
          <p>Nenhuma fotografia disponível nos furos selecionados.</p>
        )}
        {photos.length ? (
          <ol className="selection-order">
            {photos.map((id, i) => (
              <li key={id}>
                <span>
                  {availablePhotos.find((p) => p.id === id)?.caption ?? 'Fotografia indisponível'}
                </span>
                <div className="row-actions">
                  <Button
                    icon={ArrowUp}
                    type="button"
                    className="secondary"
                    disabled={i === 0}
                    onClick={() => setPhotos(swap(photos, i, -1))}
                  >
                    Subir<span className="sr-only"> fotografia {i + 1}</span>
                  </Button>
                  <Button
                    icon={ArrowDown}
                    type="button"
                    className="secondary"
                    disabled={i === photos.length - 1}
                    onClick={() => setPhotos(swap(photos, i, 1))}
                  >
                    Descer<span className="sr-only"> fotografia {i + 1}</span>
                  </Button>
                  <Button
                    icon={X}
                    type="button"
                    className="secondary"
                    onClick={() => setPhotos((v) => v.filter((x) => x !== id))}
                  >
                    Retirar<span className="sr-only"> fotografia {i + 1}</span>
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        ) : null}
        <label className="checkbox-label">
          <input
            name="others"
            type="checkbox"
            defaultChecked={current?.composition.showOtherBoreholes ?? false}
          />
          Mostrar outros furos da obra em cinza no croqui
        </label>
        <p className="help">
          Croqui técnico em fundo claro, calculado a partir das coordenadas oficiais. Sem mapa-base
          de terceiros.
        </p>
        <div className="form-actions">
          <Button
            icon={Save}
            disabled={!selected.length || selected.length > 20 || photos.length > 40}
          >
            Salvar composição
          </Button>
          <Button icon={X} className="secondary" type="button" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
