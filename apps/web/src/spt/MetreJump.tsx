import type { SptPage } from './record-types';

/** Select that reopens a saved metre, or the next new one, for editing. */
export function MetreJump({
  data,
  disabled,
  onOpen,
}: {
  data: SptPage;
  disabled: boolean;
  onOpen: (depth: string) => void;
}) {
  return (
    <nav className="metre-navigation" aria-label="Navegação por metro">
      <label htmlFor="metre-jump">Reabrir metro para edição</label>
      <div className="search-controls">
        <select
          id="metre-jump"
          value=""
          disabled={disabled}
          onChange={(e) => onOpen(e.target.value)}
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
  );
}
