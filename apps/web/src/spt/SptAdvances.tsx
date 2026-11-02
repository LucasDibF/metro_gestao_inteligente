import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';

interface Advance {
  blows: number;
  penetrationMm: number;
}

export function SptAdvances({ advances }: { advances: Advance[] }) {
  const [values, setValues] = useState(() =>
    [0, 1, 2].map((index) => ({
      blows: advances[index] ? String(advances[index].blows) : '',
      penetration: advances[index] ? String(advances[index].penetrationMm / 10) : '',
    })),
  );
  function update(index: number, field: 'blows' | 'penetration', value: string) {
    setValues((previous) =>
      previous.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    );
  }
  return (
    <div className="spt-advances">
      {values.map((value, index) => {
        const ordinal = `${index + 1}º avanço`;
        const validBlows = /^\d+$/.test(value.blows) && Number.isSafeInteger(Number(value.blows));
        return (
          <fieldset className="spt-advance" key={index}>
            <legend>{ordinal}</legend>
            <div className="spt-advance-fields">
              <div>
                <label htmlFor={`blows-${index}`}>Golpes do {ordinal}</label>
                <div className="spt-stepper">
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Diminuir golpes do ${ordinal}`}
                    disabled={!validBlows || Number(value.blows) === 0}
                    onClick={() => update(index, 'blows', String(Number(value.blows) - 1))}
                  >
                    <Minus aria-hidden="true" />
                  </button>
                  <input
                    id={`blows-${index}`}
                    name={`blows-${index}`}
                    type="number"
                    min="0"
                    step="1"
                    value={value.blows}
                    onChange={(event) => update(index, 'blows', event.target.value)}
                  />
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Aumentar golpes do ${ordinal}`}
                    disabled={
                      value.blows !== '' &&
                      (!validBlows || Number(value.blows) >= Number.MAX_SAFE_INTEGER)
                    }
                    onClick={() => update(index, 'blows', String(Number(value.blows) + 1))}
                  >
                    <Plus aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor={`penetration-${index}`}>Penetração do {ordinal} em cm</label>
                <div className="spt-penetration">
                  <input
                    id={`penetration-${index}`}
                    name={`penetration-${index}`}
                    type="number"
                    min="0"
                    step="0.1"
                    value={value.penetration}
                    onChange={(event) => update(index, 'penetration', event.target.value)}
                  />
                  <button
                    type="button"
                    className="secondary"
                    aria-label={`Usar 15 cm no ${ordinal}`}
                    aria-pressed={value.penetration !== '' && Number(value.penetration) === 15}
                    onClick={() => update(index, 'penetration', '15')}
                  >
                    15 cm
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                setValues((previous) =>
                  previous.map((item, i) => (i >= index ? { blows: '', penetration: '' } : item)),
                )
              }
              aria-label={`Marcar ${ordinal} e seguintes como não executados`}
            >
              Não executado
            </button>
          </fieldset>
        );
      })}
    </div>
  );
}
