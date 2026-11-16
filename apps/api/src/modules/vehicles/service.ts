import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma, withTx, lockVehicle, nullish } from '../../lib/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { slugify, shortId } from '../../lib/util.js';
import { zText } from '../../lib/validate.js';
import { blockWindow, findConflicts } from '../availability/service.js';
import { deleteFile } from '../../integrations/storage.js';

const money = z.coerce.number().min(0).max(9_999_999);
const date = z.coerce.date().optional().nullable();

export const vehicleSchema = z.object({
  categoryId: z.string().min(1),
  modelId: z.string().min(1),
  cityId: z.string().min(1),
  defaultDriverId: z.string().optional().nullable(),
  title: zText(160).pipe(z.string().min(3)),
  registrationNumber: z
    .string()
    .trim()
    .toUpperCase()
    .transform((s) => s.replace(/[\s-]/g, ''))
    .refine((s) => /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/.test(s) || /^\d{2}BH\d{4}[A-Z]{1,2}$/.test(s), 'Invalid registration number'),
  year: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 1),
  color: zText(40).optional(),
  seats: z.coerce.number().int().min(1).max(60),
  luggageBags: z.coerce.number().int().min(0).max(40),
  hasAc: z.boolean().default(true),
  fuelType: z.enum(['PETROL', 'DIESEL', 'CNG', 'ELECTRIC', 'HYBRID']),
  transmission: z.enum(['MANUAL', 'AUTOMATIC']),
  driverOption: z.enum(['WITH_DRIVER', 'SELF_DRIVE', 'BOTH']).default('WITH_DRIVER'),
  description: zText(4000).optional(),
  features: z.array(zText(60)).max(30).default([]),
  decorationAvailable: z.boolean().default(false),
  insuranceExpiry: date,
  fitnessExpiry: date,
  pollutionExpiry: date,
  permitType: zText(40).optional().nullable(),
  permitNumber: zText(40).optional().nullable(),
  permitExpiry: date,
  perKmRate: money,
  perDayRate: money,
  perHourRate: money,
  minBookingHours: z.coerce.number().int().min(1).max(24).default(4),
  includedKmPerDay: z.coerce.number().int().min(0).max(2000).default(250),
  includedKmPerHour: z.coerce.number().int().min(0).max(200).default(10),
  extraKmRate: money,
  extraHourRate: money,
  driverAllowancePerDay: money.default(0),
  nightChargePerNight: money.default(0),
  decorationCharge: money.default(0),
  securityDeposit: money.default(0),
  selfDrivePerDayRate: money.optional().nullable(),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;

async function validateRefs(d: Partial<VehicleInput>, ownerId: string) {
  if (d.modelId && d.categoryId) {
    const m = await prisma.vehicleModel.findUnique({ where: { id: d.modelId } });
    if (!m) throw badRequest('Unknown vehicle model');
  }
  if (d.defaultDriverId) {
    const drv = await prisma.driver.findUnique({ where: { id: d.defaultDriverId } });
    if (!drv || (drv.ownerId && drv.ownerId !== ownerId)) throw badRequest('Driver not found in this fleet');
  }
  if (d.driverOption && d.driverOption !== 'WITH_DRIVER' && d.selfDrivePerDayRate == null && d.perDayRate == null) {
    throw badRequest('Set a self-drive day rate');
  }
}

export async function createVehicle(ownerId: string, d: VehicleInput, opts: { autoApprove?: boolean } = {}) {
  await validateRefs(d, ownerId);
  return prisma.vehicle.create({
    data: { ...d, ownerId, slug: `${slugify(d.title)}-${shortId()}`, status: opts.autoApprove ? 'ACTIVE' : 'PENDING_APPROVAL' },
  });
}

/** Owners editing compliance/pricing fields don't need re-approval; changing identity (reg no, model) does. */
export async function updateVehicle(id: string, ownerId: string | null, d: Partial<VehicleInput>, opts: { isAdmin?: boolean } = {}) {
  const v = await prisma.vehicle.findUnique({ where: { id } });
  if (!v || (ownerId && v.ownerId !== ownerId)) throw notFound('Vehicle');
  await validateRefs(d, v.ownerId);
  const identityChanged = (d.registrationNumber && d.registrationNumber !== v.registrationNumber) || (d.modelId && d.modelId !== v.modelId);
  const data: Prisma.VehicleUncheckedUpdateInput = { ...d };
  if (!opts.isAdmin && identityChanged && v.status === 'ACTIVE') {
    data.status = 'PENDING_APPROVAL';
    data.statusNote = 'Re-verification required after registration/model change';
  }
  return prisma.vehicle.update({ where: { id }, data });
}

export async function addBlock(vehicleId: string, type: 'MAINTENANCE' | 'OWNER_BLOCK', startAt: Date, endAt: Date, reason?: string) {
  if (endAt <= startAt) throw badRequest('End must be after start');
  return withTx(async (tx) => {
    await lockVehicle(tx, vehicleId);
    const clashes = await findConflicts(vehicleId, startAt, endAt, tx);
    const bookings = clashes.filter((c) => c.type === 'BOOKING');
    if (bookings.length) throw conflict('This period overlaps an existing booking. Cancel or reassign the booking first.', { bookingIds: bookings.map((b) => b.bookingId) });
    if (clashes.length) throw conflict('This period overlaps an existing block');
    return tx.vehicleAvailability.create({ data: { vehicleId, type, startAt, endAt, reason } });
  });
}

export async function removeBlock(vehicleId: string, blockId: string) {
  const b = await prisma.vehicleAvailability.findFirst({ where: { id: blockId, vehicleId, type: { not: 'BOOKING' } } });
  if (!b) throw notFound('Block');
  await prisma.vehicleAvailability.delete({ where: { id: b.id } });
}

export async function vehicleIsFreeFor(vehicleId: string, pickupAt: Date, returnAt: Date) {
  const w = await blockWindow(pickupAt, returnAt);
  return (await findConflicts(vehicleId, w.startAt, w.endAt)).length === 0;
}

export async function removeImage(vehicleId: string, imageId: string) {
  const img = await prisma.vehicleImage.findFirst({ where: { id: imageId, vehicleId } });
  if (!img) throw notFound('Image');
  await prisma.vehicleImage.delete({ where: { id: img.id } });
  await deleteFile(img.url).catch(() => undefined);
}

export const ownerVehicleInclude = () =>
  ({
    images: { orderBy: { sortOrder: 'asc' } },
    documents: { orderBy: { createdAt: 'desc' } },
    category: true,
    model: true,
    city: true,
    defaultDriver: { include: { user: { select: { name: true, phone: true } } } },
    availability: {
      where: { active: true, endAt: { gte: new Date() }, OR: [...nullish('holdExpiresAt').OR, { holdExpiresAt: { gt: new Date() } }] },
      orderBy: { startAt: 'asc' },
      take: 50,
      include: { booking: { select: { bookingNumber: true, status: true } } },
    },
  }) satisfies Prisma.VehicleInclude;
