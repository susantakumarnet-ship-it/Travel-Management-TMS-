import cron from 'node-cron';
import { prisma, setAnd } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { getSettings } from '../lib/settings.js';
import { formatIst, formatIstDate, startOfIstDay, addDays } from '../lib/util.js';
import { releaseAllExpiredHolds } from '../modules/availability/service.js';
import { notify, notifyAdmins } from '../modules/notifications/service.js';

/** Prevents overlapping runs of the same job inside one process. */
function guarded(name: string, fn: () => Promise<void>) {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (e) {
      logger.error({ err: e }, `job ${name} failed`);
    } finally {
      running = false;
    }
  };
}

/** Every minute: release unpaid booking holds that have lapsed. */
export const releaseHoldsJob = guarded('release-holds', releaseAllExpiredHolds);

/** Every 15 min: remind customers N hours before pickup (once). */
export const pickupRemindersJob = guarded('pickup-reminders', async () => {
  const hours = (await getSettings())['reminders.pickupHoursBefore'];
  const now = new Date();
  const until = new Date(now.getTime() + hours * 3_600_000);
  const due = await prisma.booking.findMany({
    where: {
      pickupAt: { gt: now, lte: until },
      status: { in: ['CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED'] },
      statusHistory: { none: { note: 'Pickup reminder sent' } },
    },
    include: { customer: true, driver: { include: { user: true } } },
    take: 200,
  });
  for (const b of due) {
    await notify({ userId: b.customerId, phone: b.customer.phone }, 'PICKUP_REMINDER', {
      bookingNumber: b.bookingNumber,
      pickupAt: formatIst(b.pickupAt),
      pickup: b.pickupAddress,
      driverName: b.driver?.user.name ?? 'to be assigned',
      driverPhone: b.driver?.user.phone ?? '',
    });
    await prisma.bookingStatusHistory.create({ data: { bookingId: b.id, fromStatus: b.status, toStatus: b.status, note: 'Pickup reminder sent' } });
    if (!b.driverId && b.withDriver) {
      await notifyAdmins('Driver not assigned', `${b.bookingNumber} picks up at ${formatIst(b.pickupAt)} and has no driver yet.`);
    }
  }
});

const VEHICLE_DOCS = [
  ['insuranceExpiry', 'Insurance'],
  ['fitnessExpiry', 'Fitness certificate'],
  ['pollutionExpiry', 'Pollution (PUC) certificate'],
  ['permitExpiry', 'Permit'],
] as const;

/** Daily 09:00 IST: document-expiry alerts to owners/drivers/admins at configured day offsets. */
export const documentExpiryJob = guarded('document-expiry', async () => {
  const offsets = (await getSettings())['reminders.documentExpiryDays'];
  const today = startOfIstDay(new Date());
  const adminLines: string[] = [];

  for (const days of offsets) {
    const dayStart = addDays(today, days);
    const dayEnd = addDays(dayStart, 1);
    for (const [field, label] of VEHICLE_DOCS) {
      const vehicles = await prisma.vehicle.findMany({
        where: { [field]: { gte: dayStart, lt: dayEnd }, status: { not: 'REJECTED' } },
        include: { owner: { include: { user: true } } },
      });
      for (const v of vehicles) {
        const exp = v[field] as Date;
        await notify({ userId: v.owner.userId, phone: v.owner.user.phone, email: v.owner.user.email }, 'DOCUMENT_EXPIRY', {
          document: label,
          subject: `${v.title} (${v.registrationNumber})`,
          expiresOn: formatIstDate(exp),
          daysLeft: days,
        });
        adminLines.push(`${label} – ${v.registrationNumber} expires ${formatIstDate(exp)} (${days}d)`);
      }
    }
    const drivers = await prisma.driver.findMany({ where: { licenceExpiry: { gte: dayStart, lt: dayEnd } }, include: { user: true } });
    for (const d of drivers) {
      await notify({ userId: d.userId, phone: d.user.phone, email: d.user.email }, 'DOCUMENT_EXPIRY', {
        document: 'Driving licence',
        subject: d.user.name ?? d.licenceNumber,
        expiresOn: formatIstDate(d.licenceExpiry),
        daysLeft: days,
      });
      adminLines.push(`Driving licence – ${d.user.name ?? d.licenceNumber} expires ${formatIstDate(d.licenceExpiry)} (${days}d)`);
    }
  }

  // Auto-suspend vehicles whose insurance or fitness has lapsed (they cannot legally run).
  const lapsed = await prisma.vehicle.updateMany({
    where: { status: 'ACTIVE', OR: [setAnd('insuranceExpiry', { lt: today }), setAnd('fitnessExpiry', { lt: today })] },
    data: { status: 'INACTIVE', statusNote: 'Auto-deactivated: insurance or fitness certificate expired' },
  });
  if (lapsed.count) adminLines.push(`${lapsed.count} vehicle(s) auto-deactivated due to expired insurance/fitness.`);
  if (adminLines.length) await notifyAdmins('Document expiry report', adminLines.slice(0, 50).join('\n'));
});

/** Daily: purge consumed/expired OTPs and expired refresh tokens. */
export const cleanupJob = guarded('cleanup', async () => {
  const cutoff = new Date(Date.now() - 7 * 86_400_000);
  await prisma.otpCode.deleteMany({ where: { createdAt: { lt: cutoff } } });
  await prisma.refreshToken.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, setAnd('revokedAt', { lt: cutoff })] } });
});

export function startScheduler() {
  cron.schedule('* * * * *', releaseHoldsJob);
  cron.schedule('*/15 * * * *', pickupRemindersJob);
  cron.schedule('0 9 * * *', documentExpiryJob, { timezone: 'Asia/Kolkata' });
  cron.schedule('30 3 * * *', cleanupJob, { timezone: 'Asia/Kolkata' });
  logger.info('Scheduler started');
}
