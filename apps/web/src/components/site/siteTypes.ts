// Customer-site shapes for API responses not covered by lib/types.ts.
import type { BookingStatus, PublicVehicle, Quote, TravelPurpose, TripType } from '@/lib/types';

export interface WeddingPackage {
  id: string;
  name: string;
  slug: string;
  tier: 'SILVER' | 'GOLD' | 'PREMIUM' | 'LUXURY';
  tagline: string | null;
  description: string | null;
  basePrice: number;
  includedHours: number;
  includedKm: number;
  vehicleCount: number;
  extraHourRate: number;
  extraKmRate: number;
  decorationIncluded: boolean;
  inclusions: string[];
  vehicleHighlights: string[];
  imageUrl: string | null;
}

export type TravelPackageType = 'ODISHA_TOUR' | 'CITY_SIGHTSEEING' | 'FAMILY_VACATION' | 'WEEKEND_TRIP' | 'OUTSTATION' | 'CUSTOM';

export const PACKAGE_TYPE_LABEL: Record<TravelPackageType, string> = {
  ODISHA_TOUR: 'Odisha tours',
  CITY_SIGHTSEEING: 'City sightseeing',
  FAMILY_VACATION: 'Family vacations',
  WEEKEND_TRIP: 'Weekend trips',
  OUTSTATION: 'Outstation',
  CUSTOM: 'Custom',
};

export interface TravelPackage {
  id: string;
  title: string;
  slug: string;
  type: TravelPackageType;
  destination: string;
  startCity: string;
  durationDays: number;
  durationNights: number;
  summary: string | null;
  description: string | null;
  highlights: string[];
  inclusions: string[];
  exclusions: string[];
  basePrice: number;
  estimatedKm: number;
  minPassengers: number;
  maxPassengers: number;
  recommendedCategoryId: string | null;
  recommendedCategory: { id?: string; name: string; slug: string } | null;
  imageUrl: string | null;
  gallery?: string[];
  isFeatured: boolean;
  itinerary?: { id: string; dayNumber: number; title: string; description: string | null; places: string[] }[];
}

export interface Testimonial {
  id: string;
  name: string;
  location: string | null;
  occasion: string | null;
  rating: number;
  quote: string;
  avatarUrl: string | null;
}

export interface Destination {
  id: string;
  name: string;
  slug: string;
  state: string;
  tagline: string | null;
  imageUrl: string | null;
  distanceKm: number | null;
  startingFare: number | null;
}

export interface Offer {
  id: string;
  code: string;
  title: string;
  description: string | null;
  discountType: 'PERCENT' | 'FLAT';
  value: number;
  maxDiscount: number | null;
  minOrderAmount: number;
  validTo: string;
  purposes: TravelPurpose[];
}

export interface CmsPage {
  slug: string;
  title: string;
  body: string;
  metaTitle: string | null;
  metaDescription: string | null;
  updatedAt: string;
}

export interface VehicleReview {
  id: string;
  rating: number;
  vehicleRating: number | null;
  driverRating: number | null;
  comment: string | null;
  ownerReply: string | null;
  createdAt: string;
  customer: { name: string | null };
}

export interface VehicleDetail extends PublicVehicle {
  reviews: VehicleReview[];
  similar: PublicVehicle[];
  policies: {
    cancellationTiers: { hoursBefore: number; refundPercent: number }[];
    advancePercent: number;
    gstPercent: number;
    fuel: string;
    tollParking: string;
    nightCharge: string | null;
    securityDeposit: string | null;
  };
}

export interface SearchResult {
  items: PublicVehicle[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  estimatedKm: number;
  distanceSource: string | null;
}

export interface QuoteResponse {
  available: boolean;
  quote: Quote;
  coupon: { code: string; title: string } | null;
  estimatedKm: number;
  distance: { km: number; source: string } | null;
}

export interface CalendarBlock {
  start: string;
  end: string;
  type: 'booked' | 'unavailable';
}

export interface BookingListItem {
  id: string;
  bookingNumber: string;
  status: BookingStatus;
  purpose: TravelPurpose;
  tripType: TripType;
  pickupAt: string;
  returnAt: string;
  pickupAddress: string;
  dropAddress: string | null;
  totalAmount: number;
  finalAmount: number | null;
  advanceAmount: number;
  paidAmount: number;
  vehicle: { id: string; title: string; slug: string; seats: number; images: { url: string }[]; category: { slug: string; name: string } };
  review: { id: string; rating: number } | null;
}

export interface Payment {
  id: string;
  gateway: string;
  purpose: 'ADVANCE' | 'FULL' | 'BALANCE';
  amount: number;
  status: 'CREATED' | 'AUTHORIZED' | 'CAPTURED' | 'FAILED';
  method: string | null;
  failureReason: string | null;
  capturedAt: string | null;
  createdAt: string;
}

export interface BookingDetail extends Omit<BookingListItem, 'vehicle' | 'review'> {
  withDriver: boolean;
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
  securityDeposit: number;
  finalAmount: number | null;
  extraCharges: unknown;
  cancellationReason: string | null;
  cancellationFee: number | null;
  createdAt: string;
  holdExpiresAt: string | null;
  cancellationPreview: { hoursBefore: number; refundPercent: number; refundAmount: number; fee: number };
  vehicle: {
    id: string;
    title: string;
    slug: string;
    seats: number;
    color: string | null;
    hasAc: boolean;
    fuelType: string;
    images: { url: string; alt: string | null }[];
    category: { slug: string; name: string };
    model: { make: string; name: string };
    city: { name: string };
  };
  owner: { businessName: string; user: { phone: string; name: string | null } };
  driver: { id: string; ratingAvg: number; user: { name: string | null; phone: string; avatarUrl: string | null } } | null;
  locations: { id: string; type: 'PICKUP' | 'STOP' | 'DROP'; sequence: number; address: string; scheduledAt: string | null }[];
  passengersList: { id: string; name: string; phone: string | null; age: number | null }[];
  payments: Payment[];
  refunds: { id: string; amount: number; status: string; createdAt: string; processedAt: string | null }[];
  invoices: { id: string; invoiceNumber: string; type: string; total: number; issuedAt: string }[];
  statusHistory: { id: string; fromStatus: BookingStatus | null; toStatus: BookingStatus; note: string | null; createdAt: string }[];
  review: { id: string; rating: number; vehicleRating: number | null; driverRating: number | null; comment: string | null } | null;
}

export interface WeddingRequest {
  id: string;
  requestNumber: string;
  weddingDate: string;
  venueName: string;
  venueAddress: string;
  dropLocation: string | null;
  rentalMode: 'HOURLY' | 'FULL_DAY';
  hours: number | null;
  totalVehicles: number;
  brideCar: boolean;
  groomCar: boolean;
  guestVehicles: number;
  guestCount: number | null;
  decoratedCars: number;
  decorationRequest: string | null;
  events: { name: string; date: string; vehicles: number; notes?: string }[] | null;
  notes: string | null;
  status: 'ENQUIRY' | 'QUOTED' | 'ACCEPTED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  quotedAmount: number | null;
  quoteBreakdown: {
    items: { description: string; quantity: number; unitPrice: number }[];
    discount: number;
    gstPercent: number;
    subtotal: number;
    taxable: number;
    gst: number;
    total: number;
    notes?: string;
  } | null;
  quoteNotes: string | null;
  quotedAt: string | null;
  quoteValidUntil: string | null;
  createdAt: string;
  package: WeddingPackage | null;
  pickupPoints: { id: string; label: string | null; address: string; pickupTime: string | null; passengers: number | null }[];
  bookings: { id: string; bookingNumber: string; status: BookingStatus; vehicle: { title: string } }[];
}

export interface Address {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
}

export interface Notif {
  id: string;
  title: string | null;
  body: string;
  event: string;
  readAt: string | null;
  createdAt: string;
}
