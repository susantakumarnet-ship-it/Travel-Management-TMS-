import type { BookingStatus, City, Quote, TravelPurpose, TripType } from '@/lib/types';

export type Verification = 'PENDING' | 'APPROVED' | 'REJECTED';
export type DocStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type VehicleStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'REJECTED';

export interface Doc {
  id: string;
  type: string;
  number: string | null;
  fileKey: string;
  expiresAt?: string | null;
  status: DocStatus;
  note: string | null;
  createdAt: string;
}

export interface OwnerProfile {
  id: string;
  businessName: string;
  contactPerson: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  panNumber: string | null;
  gstin: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  upiId: string | null;
  commissionRate: number | null;
  kycStatus: Verification;
  kycNote: string | null;
  createdAt: string;
  documents: Doc[];
  user: { name: string | null; phone: string; email: string | null; status: string };
}

export interface VehicleModel {
  id: string;
  make: string;
  name: string;
  categoryId: string;
  seats: number;
  luggageBags: number;
  fuelType: string;
  transmission: string;
}

export interface AvailabilityBlock {
  id: string;
  type: 'BOOKING' | 'MAINTENANCE' | 'OWNER_BLOCK';
  startAt: string;
  endAt: string;
  reason: string | null;
  booking: { bookingNumber: string; status: BookingStatus } | null;
}

export interface OwnerVehicle {
  id: string;
  slug: string;
  categoryId: string;
  modelId: string;
  cityId: string;
  defaultDriverId: string | null;
  title: string;
  registrationNumber: string;
  year: number;
  color: string | null;
  seats: number;
  luggageBags: number;
  hasAc: boolean;
  fuelType: string;
  transmission: string;
  driverOption: 'WITH_DRIVER' | 'SELF_DRIVE' | 'BOTH';
  description: string | null;
  features: string[];
  status: VehicleStatus;
  statusNote: string | null;
  decorationAvailable: boolean;
  insuranceExpiry: string | null;
  fitnessExpiry: string | null;
  pollutionExpiry: string | null;
  permitType: string | null;
  permitNumber: string | null;
  permitExpiry: string | null;
  perKmRate: number;
  perDayRate: number;
  perHourRate: number;
  minBookingHours: number;
  includedKmPerDay: number;
  includedKmPerHour: number;
  extraKmRate: number;
  extraHourRate: number;
  driverAllowancePerDay: number;
  nightChargePerNight: number;
  decorationCharge: number;
  securityDeposit: number;
  selfDrivePerDayRate: number | null;
  images: { id: string; url: string; alt: string | null; isPrimary: boolean }[];
  documents: Doc[];
  category: { id: string; name: string; slug: string };
  model: { id: string; make: string; name: string };
  city: City;
  defaultDriver: { id: string; user: { name: string | null; phone: string } } | null;
  availability: AvailabilityBlock[];
}

export interface Location {
  id: string;
  type: 'PICKUP' | 'DROP' | 'STOP';
  sequence: number;
  address: string;
  scheduledAt: string | null;
}

export interface StatusHistory {
  id: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  note: string | null;
  createdAt: string;
}

export interface Assignment {
  id: string;
  driverId: string;
  status: 'ASSIGNED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
  note: string | null;
  driverEarning: number;
  assignedAt: string;
  respondedAt: string | null;
  driver?: { user: { name: string | null; phone: string } };
}

export interface FinalBill {
  actualKm: number;
  coveredKm: number;
  extraKm: number;
  extraKmCharge: number;
  extraHours: number;
  extraHourCharge: number;
  tolls: number;
  parking: number;
  stateTax: number;
  taxable: number;
  gst: number;
  passThrough: number;
  total: number;
  balance?: number;
}

/** Booking as returned by GET /owner/bookings/:id and GET /driver/trips/:id (driver gets a subset). */
export interface BookingDetail {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  ownerDecision: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  ownerDecisionAt: string | null;
  ownerNote: string | null;
  purpose: TravelPurpose;
  tripType: TripType;
  withDriver: boolean;
  pickupAt: string;
  returnAt: string;
  pickupAddress: string;
  dropAddress: string | null;
  estimatedKm: number;
  passengers: number;
  luggageBags: number;
  acRequired: boolean;
  decorationRequired: boolean;
  specialRequests: string | null;
  priceBreakdown: Quote;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  advanceAmount: number;
  paidAmount: number;
  securityDeposit: number;
  startOdometer: number | null;
  endOdometer: number | null;
  startedAt: string | null;
  completedAt: string | null;
  extraCharges: FinalBill | null;
  finalAmount: number | null;
  cancellationReason: string | null;
  commissionRate?: number;
  commissionAmount?: number;
  ownerPayout?: number;
  balanceDue?: number;
  vehicle: {
    id: string;
    title: string;
    registrationNumber: string;
    color: string | null;
    seats: number;
    images?: { url: string }[];
    category?: { name: string; slug: string };
    model?: { make: string; name: string };
  };
  owner?: { id: string; businessName: string; user: { phone: string; name: string | null } };
  driver: { id: string; ratingAvg: number; licenceNumber: string; user: { name: string | null; phone: string } } | null;
  customer: { id: string; name: string | null; phone: string; email: string | null };
  locations: Location[];
  statusHistory: StatusHistory[];
  assignments: Assignment[];
  payments?: { id: string; amount: number; status: string; purpose: string; method: string | null; gateway: string; createdAt: string }[];
}

export interface OwnerBookingRow {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  ownerDecision: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  tripType: TripType;
  purpose: TravelPurpose;
  pickupAt: string;
  returnAt: string;
  pickupAddress: string;
  dropAddress: string | null;
  totalAmount: number;
  ownerPayout: number;
  withDriver: boolean;
  vehicle: { id: string; title: string; registrationNumber: string };
  customer: { name: string | null; phone: string };
  driver: { id: string; user: { name: string | null; phone: string } } | null;
}

export interface DriverTrip {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  tripType: TripType;
  purpose: TravelPurpose;
  pickupAt: string;
  returnAt: string;
  pickupAddress: string;
  dropAddress: string | null;
  vehicle: { title: string; registrationNumber: string; color: string | null; seats: number };
  customer: { name: string | null; phone: string };
  locations: Location[];
  assignments: Assignment[];
}

export interface DriverProfile {
  id: string;
  licenceNumber: string;
  licenceExpiry: string;
  experienceYears: number;
  languages: string[];
  dateOfBirth: string | null;
  address: string | null;
  cityId: string | null;
  verificationStatus: Verification;
  verificationNote: string | null;
  isAvailable: boolean;
  ratingAvg: number;
  ratingCount: number;
  dailyWage: number;
  documents: Doc[];
  owner: { businessName: string } | null;
  city: City | null;
  user: { name: string | null; phone: string; email: string | null; status: string };
}

export interface FleetDriver {
  id: string;
  licenceNumber: string;
  licenceExpiry: string;
  experienceYears: number;
  verificationStatus: Verification;
  isAvailable: boolean;
  ratingAvg: number;
  ratingCount: number;
  languages: string[];
  user: { name: string | null; phone: string; status?: string };
  _count?: { bookings: number };
}
