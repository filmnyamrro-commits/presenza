import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  AttendanceRecord,
  EventRecord,
  OrganizationBranding,
} from '../types';

function detectImageFormat(dataUrl: string): 'JPEG' | 'PNG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'presenza-attendance'
  );
}

function ordinalLabel(rank: number): string {
  if (rank === 1) return '1st Earliest Arrival';
  if (rank === 2) return '2nd Earliest Arrival';
  if (rank === 3) return '3rd Earliest Arrival';
  return `${rank}th Earliest Arrival`;
}

export function downloadRecapitulationPdf(
  records: AttendanceRecord[],
  selectedEvent: EventRecord | null,
  eventsById?: Map<string, EventRecord>,
  branding?: OrganizationBranding | null
): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // Auto-resolve single event when filter is "All Sessions" but records belong to one event
  let effectiveEvent: EventRecord | null = selectedEvent;
  if (!effectiveEvent && eventsById && records.length > 0) {
    const uniqueEventIds = Array.from(new Set(records.map((r) => r.eventId)));
    if (uniqueEventIds.length === 1) {
      effectiveEvent = eventsById.get(uniqueEventIds[0]) ?? null;
    }
  }

  const includedEvents: EventRecord[] = [];
  if (!effectiveEvent && eventsById) {
    const seen = new Set<string>();
    for (const rec of records) {
      if (!seen.has(rec.eventId)) {
        seen.add(rec.eventId);
        const ev = eventsById.get(rec.eventId);
        if (ev) includedEvents.push(ev);
      }
    }
  }

  const generatedLabel = `Generated: ${new Date().toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })}`;

  // Top Header Banner (Event Name as Primary Header)
  const headerTitle = effectiveEvent
    ? effectiveEvent.title
    : records.length > 0 && new Set(records.map((r) => r.eventId)).size === 1
    ? records[0].eventName
    : 'All Recorded Sessions — Attendance Recapitulation';

  const hasLogo = Boolean(branding?.logoDataUrl);
  const orgName = branding?.organizationName?.trim() || '';
  const textStartX = hasLogo ? margin + 17.5 : margin;
  const textAvailableWidth = hasLogo ? contentWidth - 17.5 : contentWidth;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  const titleLines = doc
    .splitTextToSize(headerTitle, textAvailableWidth)
    .slice(0, 2);
  const bannerHeight = titleLines.length > 1 ? 35 : 29;

  doc.setFillColor(15, 23, 42); // #0F172A
  doc.rect(0, 0, pageWidth, bannerHeight, 'F');

  if (hasLogo && branding?.logoDataUrl) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(margin, 5.5, 14, 14, 1.5, 1.5, 'F');
      doc.addImage(
        branding.logoDataUrl,
        detectImageFormat(branding.logoDataUrl),
        margin + 0.8,
        6.3,
        12.4,
        12.4
      );
    } catch {
      // Ignore malformed logo gracefully
    }
  }

  const kickerPrefix = orgName ? `${orgName} · PRESENZA` : 'PRESENZA · RECAP REPORT';
  const kickerText = doc.splitTextToSize(
    kickerPrefix,
    Math.max(50, textAvailableWidth - 48)
  )[0];

  doc.setTextColor(147, 197, 253); // Soft blue kicker
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(kickerText, textStartX, 8.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  doc.text(generatedLabel, pageWidth - margin, 8.5, { align: 'right' });

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(titleLines, textStartX, 16.5);

  let cursorY = bannerHeight + 6;

  // Complete Event Details Card
  if (effectiveEvent) {
    const detailRows: Array<[string, string, string, string]> = [
      [
        'Session Type',
        effectiveEvent.category || '—',
        'Status',
        effectiveEvent.status === 'active' ? 'Active (Open)' : 'Closed',
      ],
      [
        'Location / Venue',
        effectiveEvent.venue || '—',
        'Event Date',
        effectiveEvent.eventDate || '—',
      ],
      [
        'Start & Cutoff',
        `${effectiveEvent.startTime}  (Late after ${effectiveEvent.lateCutoffTime})`,
        'Principal Name',
        effectiveEvent.principalName?.trim() || '—',
      ],
    ];

    const facilitatorsValue = effectiveEvent.facilitators?.trim() || '—';
    const descriptionValue = effectiveEvent.description?.trim() || '';

    const labelColW = 30;
    const halfColW = (contentWidth - 10) / 2;
    const facLines = doc.splitTextToSize(
      facilitatorsValue,
      contentWidth - labelColW - 8
    );
    const descLines = descriptionValue
      ? doc.splitTextToSize(descriptionValue, contentWidth - labelColW - 8)
      : [];

    const rowHeight = 6.2;
    const cardPaddingTop = 6;
    const facBlockHeight = Math.max(1, facLines.length) * 4.5 + 2.2;
    const descBlockHeight =
      descLines.length > 0 ? descLines.length * 4.4 + 2.5 : 0;
    const cardHeight =
      cardPaddingTop +
      detailRows.length * rowHeight +
      facBlockHeight +
      descBlockHeight +
      3;

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, cursorY, contentWidth, cardHeight, 2, 2, 'FD');

    let rowY = cursorY + 5.5;
    detailRows.forEach(([lLabel, lVal, rLabel, rVal]) => {
      // Left Pair
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`${lLabel}:`, margin + 4, rowY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      const lTrunc = doc.splitTextToSize(lVal, halfColW - labelColW - 4)[0] || '—';
      doc.text(lTrunc, margin + 4 + labelColW, rowY);

      // Right Pair
      const rightStartX = margin + 4 + halfColW + 4;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(`${rLabel}:`, rightStartX, rowY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(15, 23, 42);
      const rTrunc = doc.splitTextToSize(rVal, halfColW - labelColW - 4)[0] || '—';
      doc.text(rTrunc, rightStartX + labelColW, rowY);

      rowY += rowHeight;
    });

    // Facilitators full-width row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Facilitators:', margin + 4, rowY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(facLines, margin + 4 + labelColW, rowY);
    rowY += facBlockHeight;

    // Event Notes / Description full-width row
    if (descLines.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text('Notes / Agenda:', margin + 4, rowY);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(51, 65, 85);
      doc.text(descLines, margin + 4 + labelColW, rowY);
    }

    cursorY += cardHeight + 6;
  } else {
    // Combined Multi-Session Header Details
    const sessionSummaries =
      includedEvents.length > 0
        ? includedEvents.slice(0, 6).map((ev) => {
            const extra = [
              ev.category,
              ev.venue,
              `${ev.eventDate} ${ev.startTime} (Cutoff ${ev.lateCutoffTime})`,
              ev.facilitators ? `Facilitators: ${ev.facilitators}` : '',
              ev.principalName ? `Principal: ${ev.principalName}` : '',
            ]
              .filter(Boolean)
              .join('  ·  ');
            return `${ev.title} — ${extra}`;
          })
        : [
            'Combined chronological attendance summary ordered from earliest arrival (#1) to latest.',
          ];

    const summaryLines = sessionSummaries.flatMap((line) =>
      doc.splitTextToSize(line, contentWidth - 8)
    );
    const cardHeight = 8 + summaryLines.length * 4.5;

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, cursorY, contentWidth, cardHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `Included Event Details (${includedEvents.length || 1})`,
      margin + 4,
      cursorY + 5.2
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(summaryLines, margin + 4, cursorY + 10);

    cursorY += cardHeight + 6;
  }

  // Summary KPI Cards
  const total = records.length;
  const onTimeCount = records.filter((r) => r.status === 'On Time').length;
  const lateCount = records.filter((r) => r.status === 'Late').length;
  const rate = total > 0 ? Math.round((onTimeCount / total) * 100) : 0;

  const boxGap = 4;
  const boxWidth = (pageWidth - margin * 2 - boxGap * 3) / 4;
  const boxHeight = 18;
  const kpis = [
    { label: 'Total Check-Ins', value: String(total), color: [15, 23, 42] as const },
    { label: 'On Time', value: String(onTimeCount), color: [21, 128, 61] as const },
    { label: 'Late Arrivals', value: String(lateCount), color: [180, 83, 9] as const },
    { label: 'Punctuality Rate', value: `${rate}%`, color: [29, 78, 216] as const },
  ];

  kpis.forEach((kpi, idx) => {
    const x = margin + idx * (boxWidth + boxGap);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, cursorY, boxWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.label, x + 3, cursorY + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.text(kpi.value, x + 3, cursorY + 14);
  });

  cursorY += boxHeight + 7;

  // Big 5 Earliest Arrivals Highlight Box
  const big5 = records.slice(0, 5);
  if (big5.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Top 5 Earliest Arrivals (Big 5)', margin, cursorY);
    cursorY += 4;

    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(255, 251, 235);
    const listHeight = 6 + big5.length * 5.2;
    doc.roundedRect(margin, cursorY, pageWidth - margin * 2, listHeight, 2, 2, 'FD');

    big5.forEach((rec, i) => {
      const rowY = cursorY + 5 + i * 5.2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(180, 83, 9);
      doc.text(`#${i + 1}`, margin + 3, rowY);

      doc.setTextColor(15, 23, 42);
      doc.text(rec.fullName, margin + 11, rowY);

      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(rec.classDepartment, margin + 72, rowY);

      doc.setFont('courier', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(
        `${rec.checkInTime} (${rec.status})`,
        pageWidth - margin - 3,
        rowY,
        { align: 'right' }
      );
    });

    cursorY += listHeight + 7;
  }

  // Chronological Recapitulation Table
  autoTable(doc, {
    startY: cursorY,
    margin: { left: margin, right: margin, bottom: 16 },
    head: [
      [
        '#',
        'Photo',
        'Full Name',
        'Class / Dept',
        'Event',
        'Check-In',
        'Status',
        'Late Excuse',
      ],
    ],
    body: records.map((rec, index) => [
      String(index + 1),
      '',
      rec.fullName,
      rec.classDepartment,
      rec.eventName,
      `${rec.attendanceDate}\n${rec.checkInTime}`,
      rec.status,
      rec.status === 'Late' && rec.lateExcuse ? rec.lateExcuse : '—',
    ]),
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      valign: 'middle',
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 14, minCellHeight: 13 },
      2: { cellWidth: 30, fontStyle: 'bold' },
      3: { cellWidth: 25 },
      4: { cellWidth: 32 },
      5: { cellWidth: 22 },
      6: { cellWidth: 17, fontStyle: 'bold' },
      7: { cellWidth: 'auto' },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 6) {
        const val = String(data.cell.raw || '');
        if (val === 'On Time') {
          data.cell.styles.textColor = [21, 128, 61];
        } else if (val === 'Late') {
          data.cell.styles.textColor = [180, 83, 9];
        }
      }
    },
    didDrawCell(data) {
      if (data.section === 'body' && data.column.index === 1) {
        const rec = records[data.row.index];
        if (rec?.photoDataUrl) {
          try {
            const imgFormat = detectImageFormat(rec.photoDataUrl);
            const size = Math.min(data.cell.width - 3, data.cell.height - 2, 10.5);
            const x = data.cell.x + (data.cell.width - size) / 2;
            const y = data.cell.y + (data.cell.height - size) / 2;
            doc.addImage(rec.photoDataUrl, imgFormat, x, y, size, size);
          } catch {
            // Skip malformed image gracefully
          }
        }
      }
    },
    didDrawPage() {
      const pageNum = doc.getNumberOfPages();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `${branding?.organizationName ? `${branding.organizationName} · ` : ''}PRESENZA · Official Recapitulation · Page ${pageNum}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 7,
        { align: 'center' }
      );
    },
  });

  const prefix = selectedEvent ? slugify(selectedEvent.title) : 'all-sessions';
  doc.save(`presenza-recapitulation-${prefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

function drawCertificatePage(
  doc: jsPDF,
  record: AttendanceRecord,
  rank: number,
  totalParticipants: number,
  event?: EventRecord | null,
  branding?: OrganizationBranding | null
): void {
  const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm

  // Cream / Crisp Parchment-White Background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Outer Navy Frame
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(1.8);
  doc.rect(10, 10, pageWidth - 20, pageHeight - 20, 'S');

  // Inner Gold Trim Frame
  doc.setDrawColor(180, 83, 9);
  doc.setLineWidth(0.6);
  doc.rect(14, 14, pageWidth - 28, pageHeight - 28, 'S');

  // Corner Accent Squares
  const corners = [
    [10, 10],
    [pageWidth - 18, 10],
    [10, pageHeight - 18],
    [pageWidth - 18, pageHeight - 18],
  ];
  doc.setFillColor(15, 23, 42);
  corners.forEach(([cx, cy]) => {
    doc.rect(cx, cy, 8, 8, 'F');
  });

  // Top-Left School / Company Logo & Name
  const certOrgName = branding?.organizationName?.trim() || '';
  if (branding?.logoDataUrl) {
    try {
      doc.addImage(
        branding.logoDataUrl,
        detectImageFormat(branding.logoDataUrl),
        20,
        18.5,
        14,
        14
      );
    } catch {
      // Skip malformed logo gracefully
    }
  }
  if (certOrgName) {
    const orgTextX = branding?.logoDataUrl ? 36.5 : 20;
    const orgLines = doc.splitTextToSize(certOrgName, 58).slice(0, 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(orgLines, orgTextX, 24.5);
  }

  // Institutional Kicker
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(29, 78, 216);
  doc.text('PRESENZA', pageWidth / 2, 28, { align: 'center' });

  // Main Certificate Heading
  doc.setFont('times', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(15, 23, 42);
  doc.text('CERTIFICATE OF RECOGNITION', pageWidth / 2, 41, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(100, 116, 139);
  doc.text('TOP 5 EARLIEST ARRIVAL HONORS', pageWidth / 2, 49, { align: 'center' });

  // Rank Distinction Ribbon Box
  const isPodium = rank <= 3;
  doc.setFillColor(isPodium ? 254 : 239, isPodium ? 243 : 246, isPodium ? 199 : 255);
  doc.setDrawColor(isPodium ? 180 : 29, isPodium ? 83 : 78, isPodium ? 9 : 216);
  doc.setLineWidth(0.5);
  const badgeW = 92;
  const badgeX = (pageWidth - badgeW) / 2;
  doc.roundedRect(badgeX, 55, badgeW, 11, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  if (isPodium) {
    doc.setTextColor(146, 64, 14);
  } else {
    doc.setTextColor(30, 64, 175);
  }
  doc.text(
    `RANK #${rank} · ${ordinalLabel(rank).toUpperCase()}`,
    pageWidth / 2,
    62.2,
    { align: 'center' }
  );

  // Content Layout: Participant Photo + Formal Citation
  const photoBoxSize = 44;
  const photoX = 28;
  const photoY = 76;

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(photoX - 2, photoY - 2, photoBoxSize + 4, photoBoxSize + 4, 2, 2, 'FD');

  if (record.photoDataUrl) {
    try {
      const format = detectImageFormat(record.photoDataUrl);
      doc.addImage(
        record.photoDataUrl,
        format,
        photoX,
        photoY,
        photoBoxSize,
        photoBoxSize
      );
    } catch {
      // Skip image if unsupported
    }
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Verified Check-In Photo', photoX + photoBoxSize / 2, photoY + photoBoxSize + 7, {
    align: 'center',
  });

  // Recipient Text Block (Right of photo)
  const textCenterX = 174;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text('This certificate is proudly awarded to', textCenterX, 80, {
    align: 'center',
  });

  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(15, 23, 42);
  const nameLines = doc.splitTextToSize(record.fullName, 170);
  doc.text(nameLines, textCenterX, 93, { align: 'center' });

  const afterNameY = 93 + (nameLines.length - 1) * 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(29, 78, 216);
  doc.text(record.classDepartment, textCenterX, afterNameY + 9, {
    align: 'center',
  });

  // Divider line under department
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(95, afterNameY + 14, 253, afterNameY + 14);

  // Citation Paragraph
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);
  const citation = `For demonstrating outstanding punctuality and dedication by arriving among the earliest participants (#${rank} out of ${totalParticipants} attendees) at "${record.eventName}" on ${record.attendanceDate}, checking in at ${record.checkInTime} (${record.status}).`;
  const citationLines = doc.splitTextToSize(citation, 172);
  doc.text(citationLines, textCenterX, afterNameY + 23, { align: 'center' });

  // Recognition Seal Above Signature Row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(180, 83, 9);
  doc.text(
    `EARLY BIRD #${rank} · PRESENZA RECOGNITION AWARD`,
    pageWidth / 2,
    154,
    { align: 'center' }
  );

  // Footer Signature & Timestamp Row (3 Columns: Check-In Time | Facilitators | Principal)
  const footerY = 177;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.4);

  const facilitatorText = event?.facilitators?.trim() || 'Session Facilitator';
  const principalText = event?.principalName?.trim() || 'School Principal';

  // Left Footer: Verified Check-In Date & Time
  doc.line(24, footerY, 92, footerY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`${record.attendanceDate} · ${record.checkInTime}`, 58, footerY - 3, {
    align: 'center',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Verified Attendance Date & Time', 58, footerY + 5, { align: 'center' });

  // Center Footer: Facilitators
  doc.line(114.5, footerY, 182.5, footerY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  const facLines = doc.splitTextToSize(facilitatorText, 66).slice(0, 2);
  const facStartY = footerY - 3 - (facLines.length - 1) * 4;
  doc.text(facLines, 148.5, facStartY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Facilitators', 148.5, footerY + 5, { align: 'center' });

  // Right Footer: Principal Name
  doc.line(205, footerY, 273, footerY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  const principalLines = doc.splitTextToSize(principalText, 66).slice(0, 2);
  const principalStartY = footerY - 3 - (principalLines.length - 1) * 4;
  doc.text(principalLines, 239, principalStartY, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text('Principal', 239, footerY + 5, {
    align: 'center',
  });
}

export function downloadBig5CertificatesPdf(
  records: AttendanceRecord[],
  eventTitle?: string,
  eventsById?: Map<string, EventRecord>,
  branding?: OrganizationBranding | null
): void {
  const top5 = records.slice(0, 5);
  if (top5.length === 0) return;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  top5.forEach((rec, idx) => {
    if (idx > 0) {
      doc.addPage('a4', 'landscape');
    }
    const ev = eventsById?.get(rec.eventId) ?? null;
    drawCertificatePage(doc, rec, idx + 1, records.length, ev, branding);
  });

  const prefix = eventTitle ? slugify(eventTitle) : 'all-sessions';
  doc.save(`presenza-big5-certificates-${prefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function downloadSingleCertificatePdf(
  record: AttendanceRecord,
  rank: number,
  totalParticipants: number,
  event?: EventRecord | null,
  branding?: OrganizationBranding | null
): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  drawCertificatePage(doc, record, rank, totalParticipants, event, branding);
  doc.save(
    `presenza-certificate-rank-${rank}-${slugify(record.fullName)}.pdf`
  );
}
