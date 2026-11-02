import { CheckCircle2, Circle } from 'lucide-react';
export interface ChecklistItem {
  id: string;
  label: string;
  complete: boolean;
  stage: string;
}
export function FieldChecklist({ items }: { items: ChecklistItem[] }) {
  const pending = items.filter((item) => item.stage === 'review' && !item.complete).length;
  return (
    <section className="panel field-checklist" aria-labelledby="checklist-title">
      <h3 id="checklist-title">Conferência do furo</h3>
      <p>
        {pending
          ? `${pending} pendência(s) para enviar à revisão.`
          : 'Dados necessários para revisão preenchidos.'}
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.complete ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}
            <span>
              <strong>{item.complete ? 'Concluído' : 'Pendente'}</strong> · {item.label}
              <small>
                {item.stage === 'review'
                  ? 'Para revisão'
                  : item.stage === 'issue'
                    ? 'Para emissão do PDF'
                    : 'Recomendado; não bloqueia a revisão'}
              </small>
            </span>
          </li>
        ))}
      </ul>
      <p className="help">
        A conferência orienta o preenchimento. A validação e a aprovação técnica continuam sendo
        feitas pelo servidor.
      </p>
    </section>
  );
}
