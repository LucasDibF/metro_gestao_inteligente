export interface MapPointLabel {
  code: string;
  x: number;
  y: number;
  selected: boolean;
}
export interface PositionedMapLabel {
  index: number;
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  reference: boolean;
  moved: boolean;
}
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width + 3 &&
  a.x + a.width + 3 > b.x &&
  a.y < b.y + b.height + 3 &&
  a.y + a.height + 3 > b.y;
const glyphs = (text: string) =>
  Array.from(
    new Intl.Segmenter('pt-BR', { granularity: 'grapheme' }).segment(text),
    (g) => g.segment,
  );
function textWidth(text: string) {
  return glyphs(text).reduce(
    (sum, g) =>
      sum +
      (/[MWmw@%]/.test(g)
        ? 12.6
        : /[ilI1.,:;\- ]/.test(g)
          ? 4.8
          : /^[A-Z]$/.test(g)
            ? 9.8
            : /^[a-z0-9]$/.test(g)
              ? 8.1
              : 13),
    0,
  );
}
/** Move labels, never coordinates. Dense references remain recoverable in the table. */
export function placeMapLabels(
  points: MapPointLabel[],
  forceIndexed = false,
): PositionedMapLabel[] {
  const occupied: Box[] = [
    { x: 525, y: 0, width: 70, height: 80 },
    { x: 20, y: 470, width: 260, height: 50 },
  ];
  const placed: PositionedMapLabel[] = [];
  const ordered = points
    .map((p, index) => ({ ...p, index }))
    .sort((a, b) => Number(b.selected) - Number(a.selected) || a.index - b.index);
  const find = (p: (typeof ordered)[number], lines: string[], reference: boolean) => {
    const width = Math.max(...lines.map(textWidth)) + 4,
      height = lines.length * 16;
    const preferredX = Math.max(22, Math.min(p.x + 10, 588 - width));
    const preferredY = Math.max(65, Math.min(p.y - 10, 462 - height + 13));
    const offsets = [
      0,
      ...Array.from({ length: 28 }, (_, i) => [16 * (i + 1), -16 * (i + 1)]).flat(),
    ];
    for (const offset of offsets)
      for (const x of [preferredX, p.x - width - 12, 22, 588 - width, 300 - width / 2]) {
        const y = preferredY + offset,
          box = { x: x - 2, y: y - 13, width: width + 4, height: height + 2 };
        if (box.x < 18 || box.x + box.width > 590 || box.y < 55 || box.y + box.height > 468)
          continue;
        if (occupied.some((b) => overlap(box, b))) continue;
        if (
          points.some(
            (q) =>
              q.x + 7 > box.x &&
              q.x - 7 < box.x + box.width &&
              q.y + 7 > box.y &&
              q.y - 7 < box.y + box.height,
          )
        )
          continue;
        occupied.push(box);
        return {
          index: p.index,
          lines,
          x,
          y,
          width,
          height,
          reference,
          moved: Math.abs(x - (p.x + 10)) > 2 || Math.abs(y - (p.y - 10)) > 2,
        };
      }
    return null;
  };
  for (const p of ordered) {
    if (!p.selected && points.length > 80) continue;
    const chars = glyphs(p.code),
      lines = Array.from({ length: Math.ceil(chars.length / 20) }, (_, i) =>
        chars.slice(i * 20, i * 20 + 20).join(''),
      );
    const label = forceIndexed
      ? find(p, [`[${p.index + 1}]`], true)
      : (find(p, lines, false) ?? find(p, [`[${p.index + 1}]`], true));
    if (label) placed.push(label);
  }
  if (
    placed.filter((label) => points[label.index].selected).length <
    points.filter((p) => p.selected).length
  ) {
    if (!forceIndexed) return placeMapLabels(points, true);
    throw Error('Cannot place every selected borehole label within map');
  }
  return placed.sort((a, b) => a.index - b.index);
}
