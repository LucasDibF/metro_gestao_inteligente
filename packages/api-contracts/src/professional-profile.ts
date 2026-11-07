/** The fields an approval copies to the hole; all four must be filled for the profile to be complete. */
export type ProfessionalProfileRequiredField =
  'fullName' | 'creaNumber' | 'creaUf' | 'professionalTitle';

/**
 * GET and PUT /perfil-profissional: the signed-in engineer's own profile in the current company.
 * Without a saved profile every field is null and `version` is 0.
 */
export interface ProfessionalProfile {
  fullName: string | null;
  /** Registration number only, without the state: digits, optionally with a suffix (`123456-D`). */
  creaNumber: string | null;
  /** One of the 27 Brazilian state codes, upper case. */
  creaUf: string | null;
  professionalTitle: string | null;
  /** Kept for the company; never printed on the report. */
  phone: string | null;
  /** Kept for the company in lower case; never printed on the report. */
  professionalEmail: string | null;
  /** Send it back on PUT; 0 creates the profile. */
  version: number;
  updatedAt: string | null;
  complete: boolean;
  missingFields: ProfessionalProfileRequiredField[];
}

/** PUT /perfil-profissional. Empty or blank text clears the field. */
export interface ProfessionalProfileInput {
  fullName?: string | null;
  creaNumber?: string | null;
  creaUf?: string | null;
  professionalTitle?: string | null;
  phone?: string | null;
  professionalEmail?: string | null;
  version: number;
}
