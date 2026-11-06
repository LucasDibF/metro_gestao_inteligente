export interface ReportSnapshot {
  schemaVersion: 1;
  soilStateRuleVersion?: string;
  templateVersion: string;
  createdAt: string;
  issueNumber: number;
  tenant: { id: string; name: string; logoDataUrl?: string };
  work: {
    id: string;
    name: string;
    clientName: string | null;
    city: string | null;
    state: string | null;
    address: string | null;
  };
  report: { id: string; title: string; notes: string; version: number };
  holes: Array<{
    id: string;
    code: string;
    technicalVersion: number;
    executedDepthM: string;
    waterLevelM: string | null;
    fieldDate: string;
    reviewerName: string;
    reviewerRegistration: string;
    reviewedAt: string;
    reviewNote: string | null;
    officialCoordinate: {
      eastingM: string;
      northingM: string;
      zone: number;
      hemisphere: string;
      datum: string;
      latitude: number;
      longitude: number;
      reference: string;
      altitudeM: string | null;
    };
    tests: Array<{
      depthM: string;
      advances: Array<{ blows: number; penetrationMm: number }>;
      result: { nSpt: number | null; status: string };
      interruptionReason: string | null;
      engineVersion: string;
      fieldDetails?: { executionMethod?: string | null } | null;
    }>;
    layers: Array<{ fromM: string; toM: string; soilType: string; description: string }>;
  }>;
  photos: Array<{
    id: string;
    boreholeId: string;
    caption: string;
    objectKey: string;
    sha256: string;
    version: number;
    crop: { x: number; y: number; width: number; height: number };
  }>;
  map: {
    view?: { centerX: number; centerY: number; spanM: number };
    zone: number;
    hemisphere: string;
    points: Array<{ code: string; x: number; y: number; selected: boolean }>;
  };
}
export type MapBackground =
  | {
      state: 'ready';
      background: { image: string; scene: string; date: string; pixelSizeM: number };
    }
  | { state: 'unavailable'; reason: 'coverage' | 'service' | 'extent' | 'busy' }
  | { state: 'disabled' };
