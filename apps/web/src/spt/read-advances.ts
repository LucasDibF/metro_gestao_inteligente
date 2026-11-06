import type { Advance } from './record-types';
/** Convert the field form's centimetres to integer millimetres without rounding. */
export function readAdvances(values: Pick<FormData, 'get'>): Advance[] {
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
      throw new Error(
        'Preencha golpes e penetração na ordem dos avanços. Deixe os avanços não executados completamente vazios.',
      );
    }
    if (!/^\d+$/.test(blows) || !/^\d+(\.\d)?$/.test(penetration)) {
      throw new Error(
        'Informe golpes inteiros e penetração em centímetros com até uma casa decimal.',
      );
    }
    const [whole, fraction = '0'] = penetration.split('.');
    const penetrationMm = Number(whole) * 10 + Number(fraction);
    if (!Number.isSafeInteger(Number(blows)) || !Number.isSafeInteger(penetrationMm)) {
      throw new Error('Os valores informados estão fora do intervalo aceito.');
    }
    advances.push({ blows: Number(blows), penetrationMm });
  }
  return advances;
}
