import type { AttendanceRecord } from '../types';

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportAttendanceCsv(
  records: AttendanceRecord[],
  filenamePrefix: string
): void {
  const headers = [
    'Full Name',
    'Class / Department',
    'Event Name',
    'Attendance Date',
    'Check-In Time',
    'Server Timestamp (ISO)',
    'Status',
    'Late Excuse',
    'Photo Consent',
  ];

  const rows = records.map((record) => {
    const serverIso = record.serverTimestamp?.toDate
      ? record.serverTimestamp.toDate().toISOString()
      : '';
    return [
      escapeCsvCell(record.fullName),
      escapeCsvCell(record.classDepartment),
      escapeCsvCell(record.eventName),
      escapeCsvCell(record.attendanceDate),
      escapeCsvCell(record.checkInTime),
      escapeCsvCell(serverIso),
      escapeCsvCell(record.status),
      escapeCsvCell(record.lateExcuse || ''),
      escapeCsvCell(record.photoConsent ? 'Granted' : 'No'),
    ].join(',');
  });

  const csvContent = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = filenamePrefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  link.href = url;
  link.setAttribute(
    'download',
    `${safeName || 'presenza-attendance'}-${new Date().toISOString().slice(0, 10)}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
