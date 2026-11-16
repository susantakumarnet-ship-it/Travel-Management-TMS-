/**
 * Partial unique indexes that Prisma's MongoDB connector cannot express.
 * (A plain unique index treats every missing/null value as equal, so optional
 *  unique fields like email would collide.) Run after `prisma db push`.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const indexes: { collection: string; key: Record<string, 1>; name: string; filter: Record<string, unknown> }[] = [
  { collection: 'users', key: { email: 1 }, name: 'users_email_unique_partial', filter: { email: { $type: 'string' } } },
  { collection: 'payments', key: { gatewayOrderId: 1 }, name: 'payments_order_unique_partial', filter: { gatewayOrderId: { $type: 'string' } } },
  { collection: 'payments', key: { gatewayPaymentId: 1 }, name: 'payments_payment_unique_partial', filter: { gatewayPaymentId: { $type: 'string' } } },
  { collection: 'refunds', key: { gatewayRefundId: 1 }, name: 'refunds_gateway_unique_partial', filter: { gatewayRefundId: { $type: 'string' } } },
  // At most one *active* availability block per booking.
  { collection: 'vehicle_availability', key: { bookingId: 1 }, name: 'availability_booking_active_unique', filter: { bookingId: { $type: 'objectId' }, active: true } },
];

async function main() {
  for (const ix of indexes) {
    try {
      await prisma.$runCommandRaw({
        createIndexes: ix.collection,
        indexes: [{ key: ix.key, name: ix.name, unique: true, partialFilterExpression: ix.filter }],
      });
      console.log(`✓ ${ix.collection}.${ix.name}`);
    } catch (e) {
      console.error(`✗ ${ix.collection}.${ix.name}: ${(e as Error).message}`);
      process.exitCode = 1;
    }
  }
}

main().finally(() => prisma.$disconnect());
