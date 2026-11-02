/** Compose a display sentence without changing the source field values or internal punctuation. */
export function formatSoilDescription(parts: readonly (string | null | undefined)[]): string {
  const values = parts.map((value) => value?.trim() ?? '').filter(Boolean);
  return values
    .map((value, index) => {
      let text = index < values.length - 1 ? value.replace(/[.,;:\s]+$/u, '') : value;
      const firstWord = text.match(/^\S+/u)?.[0] ?? '';
      const letters = firstWord.replace(/[^\p{L}]/gu, '');
      if (index > 0 && !(letters.length > 1 && letters === letters.toLocaleUpperCase('pt-BR')))
        text = text.replace(/^\p{L}/u, (letter) => letter.toLocaleLowerCase('pt-BR'));
      return text;
    })
    .join(', ');
}
