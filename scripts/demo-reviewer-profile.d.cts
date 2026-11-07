export interface DemoReviewerFields {
  readonly fullName: string;
  readonly creaNumber: string;
  readonly creaUf: string;
  readonly professionalTitle: string;
}
/** The fields of GET /perfil-profissional the demo scripts read. */
export interface ReadReviewerProfile {
  complete: boolean;
  version: number;
  fullName: string | null;
  creaNumber: string | null;
  creaUf: string | null;
  professionalTitle: string | null;
  phone: string | null;
  professionalEmail: string | null;
}
export interface DemoReviewerProfileBody extends DemoReviewerFields {
  phone: string | null;
  professionalEmail: string | null;
  version: number;
}
export declare const demoReviewerProfile: DemoReviewerFields;
export declare const legacyDemoReviewerProfile: DemoReviewerFields;
export declare function needsDemoReviewerProfile(profile: ReadReviewerProfile): boolean;
export declare function demoReviewerProfileBody(
  profile: ReadReviewerProfile,
): DemoReviewerProfileBody;
