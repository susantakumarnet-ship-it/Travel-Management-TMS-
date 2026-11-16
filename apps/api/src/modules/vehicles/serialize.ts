import type { Prisma } from '@prisma/client';
import { publicUrl } from '../../integrations/storage.js';

export const publicVehicleInclude = {
  images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }] },
  category: { select: { id: true, name: true, slug: true, isWedding: true } },
  model: { select: { id: true, make: true, name: true } },
  city: { select: { id: true, name: true, state: true, slug: true } },
  owner: { select: { businessName: true } },
  defaultDriver: { select: { id: true, experienceYears: true, languages: true, ratingAvg: true, ratingCount: true, user: { select: { name: true, avatarUrl: true } } } },
} satisfies Prisma.VehicleInclude;

type V = Prisma.VehicleGetPayload<{ include: typeof publicVehicleInclude }>;

/** Show state + series, hide the unique number: "OD02AB1234" → "OD 02 •• 1234" */
export function maskRegistration(reg: string): string {
  const clean = reg.replace(/\s+/g, '').toUpperCase();
  const m = clean.match(/^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/);
  if (!m) return clean.slice(0, 4) + ' •• ' + clean.slice(-2);
  return `${m[1]} ${m[2]} •• ${m[4]}`;
}

export function serializePublicVehicle(v: V) {
  return {
    id: v.id,
    slug: v.slug,
    title: v.title,
    make: v.model.make,
    model: v.model.name,
    year: v.year,
    color: v.color,
    category: v.category,
    city: v.city,
    seats: v.seats,
    luggageBags: v.luggageBags,
    hasAc: v.hasAc,
    fuelType: v.fuelType,
    transmission: v.transmission,
    driverOption: v.driverOption,
    description: v.description,
    features: v.features,
    isFeatured: v.isFeatured,
    decorationAvailable: v.decorationAvailable,
    registration: maskRegistration(v.registrationNumber),
    operator: v.owner.businessName,
    images: v.images.map((i) => ({ id: i.id, url: publicUrl(i.url), alt: i.alt ?? v.title })),
    pricing: {
      perKmRate: v.perKmRate,
      perDayRate: v.perDayRate,
      perHourRate: v.perHourRate,
      minBookingHours: v.minBookingHours,
      includedKmPerDay: v.includedKmPerDay,
      includedKmPerHour: v.includedKmPerHour,
      extraKmRate: v.extraKmRate,
      extraHourRate: v.extraHourRate,
      driverAllowancePerDay: v.driverAllowancePerDay,
      nightChargePerNight: v.nightChargePerNight,
      decorationCharge: v.decorationCharge,
      securityDeposit: v.securityDeposit,
      selfDrivePerDayRate: v.selfDrivePerDayRate,
    },
    driver: v.defaultDriver
      ? {
          name: v.defaultDriver.user.name,
          avatarUrl: v.defaultDriver.user.avatarUrl,
          experienceYears: v.defaultDriver.experienceYears,
          languages: v.defaultDriver.languages,
          rating: v.defaultDriver.ratingAvg,
          ratingCount: v.defaultDriver.ratingCount,
        }
      : null,
    rating: v.ratingAvg,
    ratingCount: v.ratingCount,
  };
}
