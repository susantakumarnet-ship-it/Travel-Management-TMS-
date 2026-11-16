// Shapes returned by the API. Decimal columns are serialised as numbers.

export type Role = 'CUSTOMER' | 'ADMIN' | 'OWNER' | 'DRIVER';

export type BookingStatus =
  | 'PENDING'
  | 'AWAITING_PAYMENT'
  | 'CONFIRMED'
  | 'DRIVER_ASSIGNED'
  | 'VEHICLE_DISPATCHED'
  | 'TRIP_STARTED'
  | 'TRIP_COMPLETED'
  | 'CANCELLED'
  | 'REFUND_INITIATED'
  | 'REFUNDED';

export type TravelPurpose = 'WEDDING' | 'FAMILY_TRIP' | 'BUSINESS' | 'AIRPORT_TRANSFER' | 'LOCAL_TRAVEL' | 'OUTSTATION' | 'OTHER';
export type TripType = 'LOCAL_HOURLY' | 'OUTSTATION' | 'AIRPORT_TRANSFER' | 'MULTI_DAY' | 'SELF_DRIVE';

export interface Me {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  role: Role;
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
  avatarUrl: string | null;
  customerProfile?: { gstin: string | null; companyName: string | null; gender: string | null; dateOfBirth: string | null; emergencyName: string | null; emergencyPhone: string | null } | null;
  owner?: { id: string; businessName: string; kycStatus: 'PENDING' | 'APPROVED' | 'REJECTED' } | null;
  driver?: { id: string; verificationStatus: 'PENDING' | 'APPROVED' | 'REJECTED'; isAvailable: boolean } | null;
  adminRole?: { name: string; permissions: string[] } | null;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  icon: string | null;
  isWedding: boolean;
  vehicleCount?: number;
  fromPerDay?: number | null;
  fromPerKm?: number | null;
}

export interface City {
  id: string;
  name: string;
  state: string;
  slug: string;
}

export interface VehiclePricing {
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
}

export interface PublicVehicle {
  id: string;
  slug: string;
  title: string;
  make: string;
  model: string;
  year: number;
  color: string | null;
  category: { id: string; name: string; slug: string; isWedding: boolean };
  city: City;
  seats: number;
  luggageBags: number;
  hasAc: boolean;
  fuelType: string;
  transmission: string;
  driverOption: 'WITH_DRIVER' | 'SELF_DRIVE' | 'BOTH';
  description: string | null;
  features: string[];
  isFeatured: boolean;
  decorationAvailable: boolean;
  registration: string;
  operator: string;
  images: { id: string; url: string; alt: string }[];
  pricing: VehiclePricing;
  driver: { name: string | null; avatarUrl: string | null; experienceYears: number; languages: string[]; rating: number; ratingCount: number } | null;
  rating: number;
  ratingCount: number;
  available?: boolean | null;
  estimate?: { total: number; advance: number; tripType: TripType } | null;
}

export interface PriceLine {
  code: string;
  label: string;
  amount: number;
  taxable: boolean;
  detail?: string;
}

export interface Quote {
  tripType: TripType;
  hours: number;
  days: number;
  billedKm: number;
  includedKm: number;
  extraKm: number;
  nights: number;
  multiplier: number;
  lines: PriceLine[];
  subtotal: number;
  discount: number;
  taxable: number;
  gstPercent: number;
  gst: number;
  passThrough: number;
  total: number;
  advance: number;
  securityDeposit: number;
  notes: string[];
}

export interface Checkout {
  paymentId: string;
  amount: number;
  gateway: 'RAZORPAY' | 'CASHFREE' | 'TEST';
  checkout: Record<string, unknown> & { provider: 'razorpay' | 'cashfree' | 'test' };
}

export interface SiteConfig {
  contact: { phone: string; email: string; whatsapp: string; address: string };
  company: { name: string; gstin: string };
  booking: { advancePercent: number; holdMinutes: number; minLeadHours: number };
  cancellationTiers: { hoursBefore: number; refundPercent: number }[];
  gstPercent: number;
  content: Record<string, Record<string, unknown>>;
}
