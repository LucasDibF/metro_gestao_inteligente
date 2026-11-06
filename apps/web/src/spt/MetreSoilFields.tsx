import type { RefObject } from 'react';
import { Button } from '../ui/Button';
import {
  soilColorSuggestions,
  soilMoistureOptions,
  soilTypeSuggestions,
  type PreviousSoil,
  type SoilLayer,
} from './metre-soil';

/** Soil type, colour, moisture and description typed in the field for one metre. */
export function MetreSoilFields({
  formRef,
  depthValue,
  previousSoil,
  layered,
  uniformSoil,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  depthValue: string;
  previousSoil: PreviousSoil | null;
  layered: boolean;
  uniformSoil: SoilLayer | null;
}) {
  return (
    <fieldset className="spt-advance">
      <legend>Solo deste metro</legend>
      {Number(depthValue) > 1 ? (
        <Button
          type="button"
          className="secondary"
          disabled={!previousSoil}
          onClick={() => {
            const soil = formRef.current?.elements.namedItem('soilType') as HTMLInputElement | null;
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
        Intervalo no perfil: {Math.max(0, Number(depthValue) - 1).toLocaleString('pt-BR')} a{' '}
        {Number(depthValue) === 0 ? '1' : Number(depthValue).toLocaleString('pt-BR')} m. O solo é
        informado em campo; não é calculado pelos golpes.
      </p>
      {layered ? (
        <p className="help">
          Este metro contém mais de uma camada. Ao salvar, a descrição informada substituirá somente
          o intervalo indicado; os trechos vizinhos serão preservados.
        </p>
      ) : null}
      <label htmlFor="metre-soil">Tipo de solo</label>
      <input
        id="metre-soil"
        name="soilType"
        list="spt-soil-types"
        required
        pattern=".*\S.*"
        title="Informe o tipo de solo."
        maxLength={120}
        defaultValue={uniformSoil?.soilType ?? ''}
      />
      <datalist id="spt-soil-types">
        {soilTypeSuggestions.map((soil) => (
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
            {soilColorSuggestions.map((value) => (
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
            {soilMoistureOptions.map((value) => (
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
  );
}
