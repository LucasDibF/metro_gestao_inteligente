export interface Tokens {
  accessToken: string;
  refreshToken: string;
}
export interface Profile {
  localTesting?: boolean;
  userId: string;
  tenant: {
    id: string;
    name: string;
    profile?: {
      email?: string;
      phone?: string;
      address?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      workingHours?: string;
      logoDataUrl?: string;
    };
  };
  role: 'ADMIN' | 'ENGINEER' | 'OPERATOR' | 'COMMERCIAL' | 'VIEWER';
  additionalRoles?: Profile['role'][];
  canDownloadReports?: boolean;
  mfaEnabled: boolean;
}
export interface Enrollment {
  secret: string;
  uri: string;
  expiresIn: number;
}
export interface Session {
  familyId: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}
