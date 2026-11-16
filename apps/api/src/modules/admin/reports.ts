import { Router, type Response } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { prisma, nullish } from '../../lib/prisma.js';
import { query } from '../../lib/validate.js';
import { requirePermission } from '../../middleware/auth.js';
import { audit } from '../../lib/audit.js';
import { addDays, formatIstDate, round2, toIstWall } from '../../lib/util.js';
import { bookingValue, CANCELLED_STATUSES, CONFIRMED_STATUSES, groupFold, periodKey, sortedEntries, sum, type Period } from '../../lib/analytics.js';
import { env } from '../../config/env.js';

const r = Router();

interface Column {
  key: string;
  label: string;
  type?: 'money' | 'number' | 'text' | 'date';
}
interface Report {
  title: string;
  columns: Column[];
  rows: Record<string, unknown>[];
  totals?: Record<string, number>;
}

export const REPORT_TYPES = {
  bookings: 'Bookings summary',
  'vehicle-earnings': 'Vehicle-wise earnings',
  'owner-earnings': 'Owner-wise earnings',
  'driver-trips': 'Driver-wise trips',
  'wedding-revenue': 'Wedding booking revenue',
  'package-revenue': 'Travel package revenue',
  payments: 'Payment collection',
  refunds: 'Refunds',
  commission: 'Commission',
  gst: 'Tax & GST',
} as const;
type ReportType = keyof typeof REPORT_TYPES;

const CONFIRMED = [...CONFIRMED_STATUSES];
const isConfirmed = (s: string) => (CONFIRMED as string[]).includes(s);

function sumCols(rows: Record<string, unknown>[], cols: Column[]) {
  const t: Record<string, number> = {};
  for (const c of cols) if (c.type === 'money' || c.type === 'number') t[c.key] = Math.round(rows.reduce((a, r) => a + Number(r[c.key] ?? 0), 0) * 100) / 100;
  return t;
}
const istStamp = (d: Date | null, withTime = false) => (d ? toIstWall(d).toISOString().slice(0, withTime ? 16 : 10).replace('T', ' ') : '');
const km = (b: { startOdometer: number | null; endOdometer: number | null }) => (b.startOdometer != null && b.endOdometer != null ? b.endOdometer - b.startOdometer : 0);

async function build(type: ReportType, from: Date, to: Date, period: Period): Promise<Report> {
  const title = `${REPORT_TYPES[type]} (${formatIstDate(from)} – ${formatIstDate(addDays(to, -1))})`;
  const finish = (columns: Column[], rows: Record<string, unknown>[]): Report => ({ title, columns, rows, totals: sumCols(rows, columns) });
  const range = { gte: from, lt: to };

  switch (type) {
    case 'bookings': {
      const bs = await prisma.booking.findMany({ where: { createdAt: range }, select: { createdAt: true, status: true, purpose: true, finalAmount: true, totalAmount: true, paidAmount: true } });
      const rows = sortedEntries(
        groupFold(bs, (b) => periodKey(b.createdAt, period), () => ({ total: 0, confirmed: 0, completed: 0, cancelled: 0, wedding: 0, value: 0, collected: 0 }), (a, b) => {
          a.total++;
          if (isConfirmed(b.status)) {
            a.confirmed++;
            a.value += bookingValue(b);
          }
          if (b.status === 'TRIP_COMPLETED') a.completed++;
          if ((CANCELLED_STATUSES as readonly string[]).includes(b.status)) a.cancelled++;
          if (b.purpose === 'WEDDING') a.wedding++;
          a.collected += b.paidAmount;
        }),
      ).map(([p, a]) => ({ period: p, ...a, value: round2(a.value), collected: round2(a.collected) }));
      return finish(
        [
          { key: 'period', label: 'Period' },
          { key: 'total', label: 'Bookings', type: 'number' },
          { key: 'confirmed', label: 'Confirmed', type: 'number' },
          { key: 'completed', label: 'Completed', type: 'number' },
          { key: 'cancelled', label: 'Cancelled', type: 'number' },
          { key: 'wedding', label: 'Wedding', type: 'number' },
          { key: 'value', label: 'Booking value', type: 'money' },
          { key: 'collected', label: 'Collected', type: 'money' },
        ],
        rows,
      );
    }
    case 'vehicle-earnings': {
      const [vehicles, bs] = await Promise.all([
        prisma.vehicle.findMany({ select: { id: true, title: true, registrationNumber: true, owner: { select: { businessName: true } } } }),
        prisma.booking.findMany({ where: { status: 'TRIP_COMPLETED', completedAt: range }, select: { vehicleId: true, finalAmount: true, totalAmount: true, commissionAmount: true, ownerPayout: true, startOdometer: true, endOdometer: true } }),
      ]);
      const g = groupFold(bs, (b) => b.vehicleId, () => ({ trips: 0, km: 0, revenue: 0, commission: 0, payout: 0 }), (a, b) => {
        a.trips++;
        a.km += km(b);
        a.revenue += bookingValue(b);
        a.commission += b.commissionAmount;
        a.payout += b.ownerPayout;
      });
      const rows = vehicles
        .map((v) => {
          const a = g.get(v.id) ?? { trips: 0, km: 0, revenue: 0, commission: 0, payout: 0 };
          return { vehicle: v.title, registration: v.registrationNumber, owner: v.owner.businessName, trips: a.trips, km: a.km, revenue: round2(a.revenue), commission: round2(a.commission), payout: round2(a.payout) };
        })
        .sort((a, b) => b.revenue - a.revenue);
      return finish([{ key: 'vehicle', label: 'Vehicle' }, { key: 'registration', label: 'Reg. No.' }, { key: 'owner', label: 'Owner' }, { key: 'trips', label: 'Trips', type: 'number' }, { key: 'km', label: 'Km', type: 'number' }, { key: 'revenue', label: 'Revenue', type: 'money' }, { key: 'commission', label: 'Commission', type: 'money' }, { key: 'payout', label: 'Owner payout', type: 'money' }], rows);
    }
    case 'owner-earnings':
    case 'commission': {
      const [owners, bs] = await Promise.all([
        prisma.vehicleOwner.findMany({ select: { id: true, businessName: true } }),
        prisma.booking.findMany({ where: { status: 'TRIP_COMPLETED', completedAt: range }, select: { ownerId: true, finalAmount: true, totalAmount: true, taxAmount: true, commissionRate: true, commissionAmount: true, ownerPayout: true, settlementId: true } }),
      ]);
      const g = groupFold(bs, (b) => b.ownerId, () => ({ trips: 0, revenue: 0, gst: 0, rateSum: 0, commission: 0, payout: 0, unsettled: 0 }), (a, b) => {
        a.trips++;
        a.revenue += bookingValue(b);
        a.gst += b.taxAmount;
        a.rateSum += b.commissionRate;
        a.commission += b.commissionAmount;
        a.payout += b.ownerPayout;
        if (!b.settlementId) a.unsettled += b.ownerPayout;
      });
      const rows = owners
        .map((o) => {
          const a = g.get(o.id) ?? { trips: 0, revenue: 0, gst: 0, rateSum: 0, commission: 0, payout: 0, unsettled: 0 };
          return { owner: o.businessName, trips: a.trips, revenue: round2(a.revenue), gst: round2(a.gst), rate: (a.trips ? a.rateSum / a.trips : 0).toFixed(2), commission: round2(a.commission), payout: round2(a.payout), unsettled: round2(a.unsettled) };
        })
        .sort((a, b) => b.revenue - a.revenue);
      return finish([{ key: 'owner', label: 'Owner' }, { key: 'trips', label: 'Trips', type: 'number' }, { key: 'revenue', label: 'Revenue', type: 'money' }, { key: 'gst', label: 'GST', type: 'money' }, { key: 'rate', label: 'Avg rate %', type: 'text' }, { key: 'commission', label: 'Commission', type: 'money' }, { key: 'payout', label: 'Payout', type: 'money' }, { key: 'unsettled', label: 'Unsettled', type: 'money' }], rows);
    }
    case 'driver-trips': {
      const [drivers, assignments] = await Promise.all([
        prisma.driver.findMany({ select: { id: true, licenceNumber: true, ratingAvg: true, user: { select: { name: true, phone: true } } } }),
        prisma.driverAssignment.findMany({ where: { assignedAt: range }, select: { driverId: true, status: true, driverEarning: true, booking: { select: { startOdometer: true, endOdometer: true } } } }),
      ]);
      const g = groupFold(assignments, (a) => a.driverId, () => ({ completed: 0, declined: 0, km: 0, earnings: 0 }), (acc, a) => {
        if (a.status === 'COMPLETED') {
          acc.completed++;
          acc.km += km(a.booking);
          acc.earnings += a.driverEarning;
        }
        if (a.status === 'REJECTED') acc.declined++;
      });
      const rows = drivers
        .map((d) => {
          const a = g.get(d.id) ?? { completed: 0, declined: 0, km: 0, earnings: 0 };
          return { driver: d.user.name ?? '', phone: d.user.phone, licence: d.licenceNumber, completed: a.completed, declined: a.declined, km: a.km, earnings: round2(a.earnings), rating: d.ratingAvg.toFixed(2) };
        })
        .sort((a, b) => b.completed - a.completed);
      return finish([{ key: 'driver', label: 'Driver' }, { key: 'phone', label: 'Phone' }, { key: 'licence', label: 'Licence' }, { key: 'completed', label: 'Trips', type: 'number' }, { key: 'declined', label: 'Declined', type: 'number' }, { key: 'km', label: 'Km', type: 'number' }, { key: 'earnings', label: 'Earnings', type: 'money' }, { key: 'rating', label: 'Rating', type: 'text' }], rows);
    }
    case 'wedding-revenue': {
      const [requests, direct] = await Promise.all([
        prisma.weddingRequest.findMany({
          where: { weddingDate: range },
          orderBy: { weddingDate: 'asc' },
          select: { requestNumber: true, weddingDate: true, venueName: true, status: true, quotedAmount: true, customer: { select: { name: true } }, bookings: { select: { status: true, finalAmount: true, totalAmount: true, paidAmount: true } } },
        }),
        prisma.booking.findMany({ where: { purpose: 'WEDDING', AND: [nullish('weddingRequestId')], status: { in: CONFIRMED }, pickupAt: range }, select: { finalAmount: true, totalAmount: true, paidAmount: true } }),
      ]);
      const rows: Record<string, unknown>[] = requests.map((w) => ({
        request: w.requestNumber,
        date: istStamp(w.weddingDate),
        customer: w.customer.name ?? '',
        venue: w.venueName,
        status: w.status,
        quoted: w.quotedAmount ?? 0,
        vehicles: w.bookings.length,
        booked: sum(w.bookings.filter((b) => isConfirmed(b.status)), bookingValue),
        collected: sum(w.bookings, (b) => b.paidAmount),
      }));
      rows.push({ request: 'Direct wedding bookings', date: '', customer: '', venue: '', status: '', quoted: 0, vehicles: direct.length, booked: sum(direct, bookingValue), collected: sum(direct, (b) => b.paidAmount) });
      return finish([{ key: 'request', label: 'Request' }, { key: 'date', label: 'Wedding date' }, { key: 'customer', label: 'Customer' }, { key: 'venue', label: 'Venue' }, { key: 'status', label: 'Status' }, { key: 'quoted', label: 'Quoted', type: 'money' }, { key: 'vehicles', label: 'Vehicles', type: 'number' }, { key: 'booked', label: 'Booked value', type: 'money' }, { key: 'collected', label: 'Collected', type: 'money' }], rows);
    }
    case 'package-revenue': {
      const pkgs = await prisma.travelPackage.findMany({
        select: { title: true, type: true, destination: true, bookings: { where: { status: { in: CONFIRMED }, createdAt: range }, select: { finalAmount: true, totalAmount: true, paidAmount: true } } },
      });
      const rows = pkgs
        .map((p) => ({ package: p.title, type: p.type, destination: p.destination, bookings: p.bookings.length, revenue: sum(p.bookings, bookingValue), collected: sum(p.bookings, (b) => b.paidAmount) }))
        .sort((a, b) => b.revenue - a.revenue);
      return finish([{ key: 'package', label: 'Package' }, { key: 'type', label: 'Type' }, { key: 'destination', label: 'Destination' }, { key: 'bookings', label: 'Bookings', type: 'number' }, { key: 'revenue', label: 'Revenue', type: 'money' }, { key: 'collected', label: 'Collected', type: 'money' }], rows);
    }
    case 'payments': {
      const ps = await prisma.payment.findMany({
        where: { status: 'CAPTURED', capturedAt: range },
        orderBy: { capturedAt: 'asc' },
        select: { capturedAt: true, gateway: true, method: true, purpose: true, gatewayPaymentId: true, amount: true, booking: { select: { bookingNumber: true } }, user: { select: { name: true } } },
      });
      const rows = ps.map((p) => ({ date: istStamp(p.capturedAt, true), booking: p.booking.bookingNumber, customer: p.user.name ?? '', gateway: p.gateway, method: p.method ?? '', purpose: p.purpose, reference: p.gatewayPaymentId ?? '', amount: p.amount }));
      return finish([{ key: 'date', label: 'Date' }, { key: 'booking', label: 'Booking' }, { key: 'customer', label: 'Customer' }, { key: 'gateway', label: 'Gateway' }, { key: 'method', label: 'Method' }, { key: 'purpose', label: 'Purpose' }, { key: 'reference', label: 'Reference' }, { key: 'amount', label: 'Amount', type: 'money' }], rows);
    }
    case 'refunds': {
      const rs = await prisma.refund.findMany({
        where: { createdAt: range },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, status: true, reason: true, gatewayRefundId: true, amount: true, booking: { select: { bookingNumber: true, customer: { select: { name: true } } } } },
      });
      const rows = rs.map((r) => ({ date: istStamp(r.createdAt), booking: r.booking.bookingNumber, customer: r.booking.customer.name ?? '', status: r.status, reason: r.reason ?? '', reference: r.gatewayRefundId ?? '', amount: r.amount }));
      return finish([{ key: 'date', label: 'Date' }, { key: 'booking', label: 'Booking' }, { key: 'customer', label: 'Customer' }, { key: 'status', label: 'Status' }, { key: 'reason', label: 'Reason' }, { key: 'reference', label: 'Reference' }, { key: 'amount', label: 'Amount', type: 'money' }], rows);
    }
    case 'gst': {
      const inv = await prisma.invoice.findMany({ where: { issuedAt: range, type: { not: 'ADVANCE_RECEIPT' } }, orderBy: { issuedAt: 'asc' } });
      const rows = inv.map((i) => ({ date: istStamp(i.issuedAt), invoice: i.invoiceNumber, type: i.type, party: i.billingName, gstin: i.billingGstin ?? '', pos: i.placeOfSupply, taxable: i.taxableAmount, cgst: i.cgst, sgst: i.sgst, igst: i.igst, total: i.total }));
      return finish([{ key: 'date', label: 'Date' }, { key: 'invoice', label: 'Invoice' }, { key: 'type', label: 'Type' }, { key: 'party', label: 'Party' }, { key: 'gstin', label: 'GSTIN' }, { key: 'pos', label: 'Place of supply' }, { key: 'taxable', label: 'Taxable', type: 'money' }, { key: 'cgst', label: 'CGST', type: 'money' }, { key: 'sgst', label: 'SGST', type: 'money' }, { key: 'igst', label: 'IGST', type: 'money' }, { key: 'total', label: 'Total', type: 'money' }], rows);
    }
  }
}

// ───────────────────── Exporters ─────────────────────

const csvCell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV/formula injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function sendCsv(res: Response, rep: Report, filename: string) {
  const lines = [rep.columns.map((c) => csvCell(c.label)).join(',')];
  for (const row of rep.rows) lines.push(rep.columns.map((c) => csvCell(row[c.key])).join(','));
  if (rep.totals && Object.keys(rep.totals).length) lines.push(rep.columns.map((c, i) => csvCell(i === 0 ? 'TOTAL' : rep.totals![c.key] ?? '')).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send('﻿' + lines.join('\r\n'));
}

async function sendXlsx(res: Response, rep: Report, filename: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = env.COMPANY_NAME;
  const ws = wb.addWorksheet('Report');
  ws.addRow([rep.title]).font = { bold: true, size: 14, color: { argb: 'FF0B1F4B' } };
  ws.addRow([]);
  const header = ws.addRow(rep.columns.map((c) => c.label));
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0B1F4B' } };
  });
  for (const row of rep.rows) ws.addRow(rep.columns.map((c) => (c.type === 'money' || c.type === 'number' ? Number(row[c.key] ?? 0) : (row[c.key] as string) ?? '')));
  if (rep.totals && Object.keys(rep.totals).length) {
    const t = ws.addRow(rep.columns.map((c, i) => (i === 0 ? 'TOTAL' : rep.totals![c.key] ?? '')));
    t.font = { bold: true };
  }
  rep.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(12, c.label.length + 4);
    if (c.type === 'money') col.numFmt = '#,##,##0.00';
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}

function sendPdf(res: Response, rep: Report, filename: string) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);
  doc.fill('#0b1f4b').font('Helvetica-Bold').fontSize(14).text(env.COMPANY_NAME);
  doc.fill('#374151').font('Helvetica').fontSize(10).text(rep.title).moveDown(0.6);
  const width = doc.page.width - 64;
  const colW = width / rep.columns.length;
  let y = doc.y;
  const drawHeader = () => {
    doc.rect(32, y, width, 18).fill('#0b1f4b');
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(8);
    rep.columns.forEach((c, i) => doc.text(c.label, 36 + i * colW, y + 5, { width: colW - 6, align: c.type === 'money' || c.type === 'number' ? 'right' : 'left', lineBreak: false }));
    y += 20;
    doc.font('Helvetica').fontSize(8).fill('#111827');
  };
  drawHeader();
  const fmt = (c: Column, v: unknown) => (c.type === 'money' ? Number(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v ?? ''));
  const rows = rep.totals && Object.keys(rep.totals).length ? [...rep.rows, { ...rep.totals, [rep.columns[0].key]: 'TOTAL', __total: true }] : rep.rows;
  rows.forEach((row, idx) => {
    if (y > doc.page.height - 48) {
      doc.addPage();
      y = 32;
      drawHeader();
    }
    if ((row as { __total?: boolean }).__total) doc.font('Helvetica-Bold');
    else if (idx % 2) doc.rect(32, y - 2, width, 14).fill('#f3f4f6').fill('#111827');
    rep.columns.forEach((c, i) => doc.text(fmt(c, row[c.key]), 36 + i * colW, y, { width: colW - 6, align: c.type === 'money' || c.type === 'number' ? 'right' : 'left', lineBreak: false, ellipsis: true }));
    y += 14;
  });
  doc.end();
}

r.get('/', requirePermission('reports:read'), (_req, res) => res.json(REPORT_TYPES));

r.get('/:type', requirePermission('reports:read'), async (req, res) => {
  const type = z.enum(Object.keys(REPORT_TYPES) as [ReportType, ...ReportType[]]).parse(req.params.type);
  const q = query(
    req,
    z.object({
      from: z.coerce.date().default(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
      to: z.coerce.date().optional(),
      period: z.enum(['day', 'week', 'month', 'year']).default('day'),
      format: z.enum(['json', 'csv', 'xlsx', 'pdf']).default('json'),
    }),
  );
  // "to" is inclusive in the UI → exclusive upper bound here.
  const to = q.to ? addDays(q.to, 1) : addDays(new Date(), 1);
  const rep = await build(type, q.from, to, q.period);
  const filename = `royal-ride-${type}-${q.from.toISOString().slice(0, 10)}`;
  if (q.format !== 'json') await audit(req, 'report.export', 'Report', type, { after: { format: q.format, from: q.from, to } });
  if (q.format === 'csv') return sendCsv(res, rep, filename);
  if (q.format === 'xlsx') return sendXlsx(res, rep, filename);
  if (q.format === 'pdf') return sendPdf(res, rep, filename);
  res.json(rep);
});

export default r;
