import { lazy } from 'react';

/** Each workspace screen loads on first use, keeping the sign-in bundle small. */
export const Access = lazy(() =>
  import('./management/Access').then((module) => ({ default: module.Access })),
);
export const Clients = lazy(() =>
  import('./management/Clients').then((module) => ({ default: module.Clients })),
);
export const ReportCenter = lazy(() =>
  import('./workspace/ReportCenter').then((module) => ({ default: module.ReportCenter })),
);
export const WorkDestination = lazy(() =>
  import('./workspace/WorkDestination').then((module) => ({ default: module.WorkDestination })),
);
export const Trash = lazy(() =>
  import('./works/Trash').then((module) => ({ default: module.Trash })),
);
export const Works = lazy(() =>
  import('./works/Works').then((module) => ({ default: module.Works })),
);
export const ProfessionalProfile = lazy(() =>
  import('./profile/ProfessionalProfile').then((module) => ({
    default: module.ProfessionalProfile,
  })),
);
export const Security = lazy(() =>
  import('./auth/Security').then((module) => ({ default: module.Security })),
);
