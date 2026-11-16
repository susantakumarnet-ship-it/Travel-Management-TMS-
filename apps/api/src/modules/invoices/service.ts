import PDFDocument from 'pdfkit';
import type { InvoiceType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { nextInvoiceNumber } from '../../lib/sequence.js';
import { getSettings } from '../../lib/settings.js';
import { formatINR, formatIst, formatIstDate, num, round2 } from '../../lib/util.js';
import { env } from '../../config/env.js';
import type { Quote } from '../pricing/engine.js';

interface LineItem {
  description: string;
  sac?: string;
  amount: number;
  taxable: boolean;
}

/** Indian GSTIN state codes → state (first two digits). Used for place of supply. */
const GST_STATE: Record<string, string> = {
  '21': 'Odisha', '20': 'Jharkhand', '19': 'West Bengal', '22': 'Chhattisgarh', '37': 'Andhra Pradesh',
  '36': 'Telangana', '27': 'Maharashtra', '29': 'Karnataka', '33': 'Tamil Nadu', '07': 'Delhi', '09': 'Uttar Pradesh', '10': 'Bihar',
};

export async function createInvoice(bookingId: string, type: InvoiceType) {
  const existing = await prisma.invoice.findFirst({ where: { bookingId, type } });
  if (existing) return existing;
  const b = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { customer: { include: { customerProfile: true } }, vehicle: true },
  });
  const s = await getSettings();
  const sac = s['tax.sacCode'];
  const gstPct = (b.priceBreakdown as unknown as Quote).gstPercent ?? s['tax.gstPercent'];
  const quote = b.priceBreakdown as unknown as Quote;
  const gstin = b.customer.customerProfile?.gstin ?? null;
  const placeOfSupply = (gstin && GST_STATE[gstin.slice(0, 2)]) || env.COMPANY_STATE;
  const interState = placeOfSupply.toLowerCase() !== env.COMPANY_STATE.toLowerCase();

  let items: LineItem[];
  let taxable: number;
  let passThrough: number;

  if (type === 'TAX_INVOICE') {
    const bill = (b.extraCharges ?? {}) as Record<string, number>;
    items = quote.lines.filter((l) => l.taxable).map((l) => ({ description: `${l.label}${l.detail ? ` (${l.detail})` : ''}`, sac, amount: l.amount, taxable: true }));
    if (bill.extraKmCharge) items.push({ description: `Additional kilometres (${bill.extraKm} km)`, sac, amount: bill.extraKmCharge, taxable: true });
    if (bill.extraHourCharge) items.push({ description: `Additional hours (${bill.extraHours} hr)`, sac, amount: bill.extraHourCharge, taxable: true });
    if (bill.tolls) items.push({ description: 'Toll charges (reimbursement)', amount: bill.tolls, taxable: false });
    if (bill.parking) items.push({ description: 'Parking charges (reimbursement)', amount: bill.parking, taxable: false });
    if (bill.stateTax) items.push({ description: 'Interstate permit tax (reimbursement)', amount: bill.stateTax, taxable: false });
    taxable = round2(bill.taxable ?? quote.taxable);
    passThrough = round2(bill.passThrough ?? quote.passThrough);
  } else {
    // Receipt voucher for the advance: GST is payable on advances for services.
    const paid = num(b.paidAmount);
    taxable = round2(paid / (1 + gstPct / 100));
    passThrough = 0;
    items = [{ description: `Advance for booking ${b.bookingNumber} – ${b.vehicle.title}`, sac, amount: taxable, taxable: true }];
  }

  const tax = round2((taxable * gstPct) / 100);
  const data = {
    bookingId,
    type,
    billingName: b.customer.customerProfile?.companyName || b.customer.name || b.customer.phone,
    billingGstin: gstin,
    placeOfSupply,
    lineItems: items as unknown as Prisma.InputJsonValue,
    taxableAmount: taxable,
    cgst: interState ? 0 : round2(tax / 2),
    sgst: interState ? 0 : round2(tax - round2(tax / 2)),
    igst: interState ? tax : 0,
    total: round2(taxable + tax + passThrough),
  };
  return prisma.$transaction(async (tx) => tx.invoice.create({ data: { ...data, invoiceNumber: await nextInvoiceNumber(tx) } }));
}

/** Render an invoice to a PDF buffer (pdfkit core fonts; "Rs." used since Helvetica lacks the ₹ glyph). */
export async function renderInvoicePdf(invoiceId: string): Promise<Buffer> {
  const inv = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { booking: { include: { vehicle: true, customer: true } } },
  });
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const navy = '#0b1f4b';
  const gold = '#b8912f';
  doc.rect(0, 0, doc.page.width, 90).fill(navy);
  doc.fill(gold).font('Helvetica-Bold').fontSize(22).text('ROYAL RIDE', 48, 30);
  doc.fill('#ffffff').font('Helvetica').fontSize(9).text('Your Journey, Our Responsibility', 48, 58);
  const title = inv.type === 'TAX_INVOICE' ? 'TAX INVOICE' : inv.type === 'ADVANCE_RECEIPT' ? 'RECEIPT VOUCHER' : 'CREDIT NOTE';
  doc.fill('#ffffff').font('Helvetica-Bold').fontSize(14).text(title, 300, 34, { width: 247, align: 'right' });

  doc.fill('#111827').font('Helvetica-Bold').fontSize(10).text(env.COMPANY_NAME, 48, 110);
  doc.font('Helvetica').fontSize(9).fill('#374151').text(env.COMPANY_ADDRESS, { width: 260 });
  doc.text(`GSTIN: ${env.COMPANY_GSTIN || '—'}`).text(`${env.COMPANY_PHONE}  ${env.COMPANY_EMAIL}`);

  doc.font('Helvetica').fontSize(9).fill('#374151');
  const meta: [string, string][] = [
    ['Invoice No.', inv.invoiceNumber],
    ['Date', formatIstDate(inv.issuedAt)],
    ['Booking', inv.booking.bookingNumber],
    ['Place of supply', inv.placeOfSupply],
  ];
  meta.forEach(([k, v], i) => {
    doc.text(k, 340, 110 + i * 14, { width: 90 });
    doc.font('Helvetica-Bold').text(v, 430, 110 + i * 14, { width: 117, align: 'right' }).font('Helvetica');
  });

  doc.moveDown(2);
  const y0 = 190;
  doc.font('Helvetica-Bold').fill(navy).fontSize(10).text('Billed to', 48, y0);
  doc.font('Helvetica').fill('#111827').fontSize(9).text(inv.billingName, 48, y0 + 14);
  doc.text(`Phone: ${inv.booking.customer.phone}`);
  if (inv.billingGstin) doc.text(`GSTIN: ${inv.billingGstin}`);

  doc.font('Helvetica-Bold').fill(navy).fontSize(10).text('Trip', 300, y0);
  doc.font('Helvetica').fill('#111827').fontSize(9)
    .text(`${inv.booking.vehicle.title} (${inv.booking.vehicle.registrationNumber})`, 300, y0 + 14, { width: 247 })
    .text(`Pickup: ${formatIst(inv.booking.pickupAt)}`, { width: 247 })
    .text(`Return: ${formatIst(inv.booking.returnAt)}`, { width: 247 });

  // Table
  let y = 270;
  doc.rect(48, y, 499, 20).fill('#f3f4f6');
  doc.fill('#111827').font('Helvetica-Bold').fontSize(9);
  doc.text('#', 54, y + 6).text('Description', 74, y + 6).text('SAC', 390, y + 6).text('Amount (Rs.)', 440, y + 6, { width: 100, align: 'right' });
  y += 26;
  doc.font('Helvetica').fontSize(9);
  const items = inv.lineItems as unknown as LineItem[];
  items.forEach((it, i) => {
    const h = Math.max(14, doc.heightOfString(it.description, { width: 300 }));
    doc.text(String(i + 1), 54, y).text(it.description, 74, y, { width: 300 }).text(it.sac ?? '—', 390, y).text(it.amount.toFixed(2), 440, y, { width: 100, align: 'right' });
    y += h + 6;
  });
  doc.moveTo(48, y).lineTo(547, y).strokeColor('#e5e7eb').stroke();
  y += 10;
  const totals: [string, number][] = [['Taxable value', num(inv.taxableAmount)]];
  if (num(inv.igst)) totals.push(['IGST', num(inv.igst)]);
  else totals.push(['CGST', num(inv.cgst)], ['SGST', num(inv.sgst)]);
  totals.push(['Total', num(inv.total)]);
  totals.forEach(([k, v], i) => {
    const last = i === totals.length - 1;
    doc.font(last ? 'Helvetica-Bold' : 'Helvetica').fontSize(last ? 11 : 9).fill(last ? navy : '#111827');
    doc.text(k, 340, y, { width: 100 }).text(formatINR(v), 440, y, { width: 100, align: 'right' });
    y += last ? 18 : 14;
  });

  y += 20;
  doc.font('Helvetica').fontSize(8).fill('#6b7280')
    .text('Tolls, parking and permit taxes are reimbursements and are not subject to GST. This is a computer-generated document and does not require a signature.', 48, y, { width: 499 });
  doc.end();
  return done;
}
