import type { Timestamp } from 'firebase/firestore';

export type EventCategory = string;

export type EventStatus = 'active' | 'closed';

export type AttendanceStatus = 'On Time' | 'Late';

export interface EventRecord {
  id: string;
  title: string;
  category: EventCategory;
  description: string;
  venue: string;
  eventDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  lateCutoffTime: string; // HH:MM
  cutoffTimestamp: Timestamp;
  status: EventStatus;
  createdByUid: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  departmentLabel?: string;
  departmentPresets?: string;
  consentText?: string;
  facilitators?: string;
  principalName?: string;
  requireParticipantLogin?: boolean;
}

export interface AttendanceRecord {
  id: string;
  eventId: string;
  eventName: string;
  fullName: string;
  classDepartment: string;
  photoDataUrl: string;
  photoConsent: boolean;
  attendanceDate: string; // YYYY-MM-DD
  checkInTime: string;
  serverTimestamp: Timestamp;
  status: AttendanceStatus;
  lateExcuse: string;
  participantEmail?: string;
  participantUid?: string;
}

export interface CheckInReceipt {
  id: string;
  eventId: string;
  eventName: string;
  fullName: string;
  classDepartment: string;
  photoDataUrl: string;
  attendanceDate: string;
  checkInTime: string;
  recordedAtIso: string;
  status: AttendanceStatus;
  lateExcuse: string;
  participantEmail?: string;
}

export interface OrganizationBranding {
  organizationName: string;
  logoDataUrl: string;
}

export interface AuthorizedAdminRecord {
  id: string;
  email: string;
  displayName: string;
  addedByUid: string;
  addedByEmail: string;
  createdAt: Timestamp;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}
