import type { BookingStatus } from '@prisma/client';

/** Allowed booking status transitions. Anything not listed is rejected. */
export const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ['AWAITING_PAYMENT', 'CONFIRMED', 'CANCELLED'],
  AWAITING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED', 'CANCELLED'],
  DRIVER_ASSIGNED: ['CONFIRMED', 'DRIVER_ASSIGNED', 'VEHICLE_DISPATCHED', 'TRIP_STARTED', 'CANCELLED'],
  VEHICLE_DISPATCHED: ['TRIP_STARTED', 'CANCELLED'],
  TRIP_STARTED: ['TRIP_COMPLETED'],
  TRIP_COMPLETED: [],
  CANCELLED: ['REFUND_INITIATED', 'CONFIRMED'],
  REFUND_INITIATED: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses during which the vehicle and driver are committed. */
export const ACTIVE_STATUSES: BookingStatus[] = [
  'PENDING',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'DRIVER_ASSIGNED',
  'VEHICLE_DISPATCHED',
  'TRIP_STARTED',
];

export const CANCELLABLE_BY_CUSTOMER: BookingStatus[] = ['PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'DRIVER_ASSIGNED'];

export const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Pending',
  AWAITING_PAYMENT: 'Awaiting Payment',
  CONFIRMED: 'Confirmed',
  DRIVER_ASSIGNED: 'Driver Assigned',
  VEHICLE_DISPATCHED: 'Vehicle Dispatched',
  TRIP_STARTED: 'Trip Started',
  TRIP_COMPLETED: 'Trip Completed',
  CANCELLED: 'Cancelled',
  REFUND_INITIATED: 'Refund Initiated',
  REFUNDED: 'Refunded',
};
