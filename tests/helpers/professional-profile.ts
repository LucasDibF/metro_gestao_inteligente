import assert from 'node:assert/strict';

/** A complete synthetic profile; the registration it yields on the hole is "CREA-SP 5060000001". */
export const completeProfessionalProfile = {
  fullName: 'Engenheira de teste',
  creaNumber: '5060000001',
  creaUf: 'SP',
  professionalTitle: 'Engenheira civil',
} as const;
export const completeReviewerCopy = {
  reviewerName: 'Engenheira de teste',
  reviewerRegistration: 'CREA-SP 5060000001',
  reviewerTitle: 'Engenheira civil',
} as const;

/** Creates the engineer's own profile through the API, so the approval that follows can copy it. */
export async function saveProfessionalProfile(
  base: string,
  token: string,
  fields: Record<string, unknown> = completeProfessionalProfile,
  version = 0,
): Promise<{ version: number; complete: boolean }> {
  const response = await fetch(base + '/perfil-profissional', {
    method: 'PUT',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...fields, version }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()) as { version: number; complete: boolean };
}
