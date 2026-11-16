/**
 * Development/demo seed. Idempotent (safe to re-run).
 * Creates catalogue, demo partners/vehicles/drivers, packages, CMS content and an admin.
 * No bookings or payments are fabricated — those only come from real flows.
 */
import { PrismaClient, type FuelType, type Transmission, type DriverOption } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const year = new Date().getFullYear();
const inYears = (n: number) => new Date(Date.UTC(year + n, 2, 31));

async function main() {
  // ── Admin roles & super admin ──
  const superRole = await prisma.adminRole.upsert({
    where: { name: 'Super Admin' },
    update: { permissions: ['*'], isSystem: true },
    create: { name: 'Super Admin', description: 'Full access to every module', permissions: ['*'], isSystem: true },
  });
  await prisma.adminRole.upsert({
    where: { name: 'Operations Manager' },
    update: {},
    create: {
      name: 'Operations Manager',
      description: 'Bookings, weddings, vehicles, drivers and customers',
      permissions: ['dashboard:read', 'bookings:write', 'weddings:write', 'vehicles:write', 'drivers:write', 'owners:read', 'customers:write', 'reviews:write', 'notifications:read', 'reports:read'],
    },
  });
  await prisma.adminRole.upsert({
    where: { name: 'Finance' },
    update: {},
    create: {
      name: 'Finance',
      description: 'Payments, refunds, commissions and reports',
      permissions: ['dashboard:read', 'payments:write', 'refunds:write', 'commissions:write', 'coupons:write', 'reports:read', 'bookings:read'],
    },
  });
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@royalride.local').toLowerCase();
  const adminPhone = process.env.SEED_ADMIN_PHONE ?? '9000000001';
  await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: {
      email: adminEmail,
      phone: adminPhone,
      name: 'Platform Admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      adminRoleId: superRole.id,
      passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345', 12),
    },
  });

  // ── Cities ──
  const cityData = [
    ['Bhubaneswar', 20.2961, 85.8245],
    ['Cuttack', 20.4625, 85.8828],
    ['Puri', 19.8135, 85.8312],
    ['Rourkela', 22.2604, 84.8536],
    ['Sambalpur', 21.4669, 83.9812],
    ['Berhampur', 19.3149, 84.7941],
  ] as const;
  const cities: Record<string, string> = {};
  for (const [name, lat, lng] of cityData) {
    const c = await prisma.city.upsert({ where: { slug: slug(name) }, update: {}, create: { name, state: 'Odisha', slug: slug(name), lat, lng } });
    cities[name] = c.id;
  }

  // ── Categories & models ──
  const categories = [
    { name: 'Economy Cars', icon: 'hatchback', description: 'Budget-friendly hatchbacks for city rides and short trips.', commissionRate: 12, isWedding: false },
    { name: 'Sedan Cars', icon: 'sedan', description: 'Comfortable sedans with generous boot space for families and business travel.', commissionRate: 12, isWedding: false },
    { name: 'SUV & MUV', icon: 'suv', description: 'Spacious 6–7 seaters for family tours, outstation and hill drives.', commissionRate: 13, isWedding: false },
    { name: 'Luxury Cars', icon: 'luxury', description: 'Premium sedans and SUVs for VIPs, corporate guests and celebrations.', commissionRate: 15, isWedding: false },
    { name: 'Wedding Special', icon: 'wedding', description: 'Decorated luxury and vintage cars for the bride, groom and grand entries.', commissionRate: 15, isWedding: true },
    { name: 'Traveller & Group', icon: 'bus', description: 'Tempo Travellers, mini buses and luxury coaches for groups and wedding guests.', commissionRate: 12, isWedding: false },
  ];
  const cat: Record<string, string> = {};
  for (const [i, c] of categories.entries()) {
    const row = await prisma.vehicleCategory.upsert({ where: { slug: slug(c.name) }, update: {}, create: { ...c, slug: slug(c.name), sortOrder: i } });
    cat[c.name] = row.id;
  }

  type M = [make: string, name: string, category: string, seats: number, bags: number, fuel: FuelType, trans: Transmission];
  const models: M[] = [
    ['Maruti Suzuki', 'Alto', 'Economy Cars', 4, 1, 'PETROL', 'MANUAL'],
    ['Maruti Suzuki', 'Swift', 'Economy Cars', 4, 2, 'PETROL', 'MANUAL'],
    ['Hyundai', 'Grand i10', 'Economy Cars', 4, 2, 'PETROL', 'MANUAL'],
    ['Tata', 'Tiago', 'Economy Cars', 4, 2, 'CNG', 'MANUAL'],
    ['Renault', 'Kwid', 'Economy Cars', 4, 1, 'PETROL', 'MANUAL'],
    ['Maruti Suzuki', 'Dzire', 'Sedan Cars', 4, 3, 'CNG', 'MANUAL'],
    ['Honda', 'Amaze', 'Sedan Cars', 4, 3, 'PETROL', 'MANUAL'],
    ['Hyundai', 'Aura', 'Sedan Cars', 4, 3, 'CNG', 'MANUAL'],
    ['Honda', 'City', 'Sedan Cars', 4, 3, 'PETROL', 'AUTOMATIC'],
    ['Hyundai', 'Verna', 'Sedan Cars', 4, 3, 'PETROL', 'AUTOMATIC'],
    ['Maruti Suzuki', 'Ertiga', 'SUV & MUV', 6, 2, 'CNG', 'MANUAL'],
    ['Kia', 'Carens', 'SUV & MUV', 6, 3, 'DIESEL', 'MANUAL'],
    ['Toyota', 'Innova', 'SUV & MUV', 7, 3, 'DIESEL', 'MANUAL'],
    ['Toyota', 'Innova Crysta', 'SUV & MUV', 7, 4, 'DIESEL', 'MANUAL'],
    ['Mahindra', 'Scorpio', 'SUV & MUV', 7, 2, 'DIESEL', 'MANUAL'],
    ['Mahindra', 'XUV700', 'SUV & MUV', 6, 3, 'DIESEL', 'AUTOMATIC'],
    ['Kia', 'Seltos', 'SUV & MUV', 4, 3, 'PETROL', 'AUTOMATIC'],
    ['Hyundai', 'Creta', 'SUV & MUV', 4, 3, 'DIESEL', 'AUTOMATIC'],
    ['Toyota', 'Camry Hybrid', 'Luxury Cars', 4, 3, 'HYBRID', 'AUTOMATIC'],
    ['BMW', '5 Series', 'Luxury Cars', 4, 3, 'DIESEL', 'AUTOMATIC'],
    ['Mercedes-Benz', 'E-Class', 'Luxury Cars', 4, 3, 'DIESEL', 'AUTOMATIC'],
    ['Audi', 'A6', 'Luxury Cars', 4, 3, 'PETROL', 'AUTOMATIC'],
    ['Jaguar', 'XF', 'Luxury Cars', 4, 3, 'DIESEL', 'AUTOMATIC'],
    ['Mercedes-Benz', 'S-Class', 'Wedding Special', 4, 2, 'DIESEL', 'AUTOMATIC'],
    ['Heritage Motors', 'Vintage Convertible', 'Wedding Special', 2, 0, 'PETROL', 'MANUAL'],
    ['Toyota', 'Fortuner', 'Wedding Special', 7, 3, 'DIESEL', 'AUTOMATIC'],
    ['Force', 'Traveller 12 Seater', 'Traveller & Group', 12, 8, 'DIESEL', 'MANUAL'],
    ['Force', 'Traveller 17 Seater', 'Traveller & Group', 17, 10, 'DIESEL', 'MANUAL'],
    ['Force', 'Traveller 20 Seater', 'Traveller & Group', 20, 12, 'DIESEL', 'MANUAL'],
    ['Force', 'Traveller 26 Seater', 'Traveller & Group', 26, 14, 'DIESEL', 'MANUAL'],
    ['Tata', 'Mini Bus 32 Seater', 'Traveller & Group', 32, 20, 'DIESEL', 'MANUAL'],
    ['Volvo', 'Luxury Coach 45 Seater', 'Traveller & Group', 45, 30, 'DIESEL', 'AUTOMATIC'],
  ];
  const model: Record<string, { id: string; m: M }> = {};
  for (const m of models) {
    const row = await prisma.vehicleModel.upsert({
      where: { make_name: { make: m[0], name: m[1] } },
      update: {},
      create: { make: m[0], name: m[1], categoryId: cat[m[2]], seats: m[3], luggageBags: m[4], fuelType: m[5], transmission: m[6] },
    });
    model[`${m[0]} ${m[1]}`] = { id: row.id, m };
  }

  // ── Demo partners (KYC approved) ──
  const owners = [
    { phone: '9000000101', name: 'Sanjay Mohanty', businessName: 'Kalinga Car Rentals', city: 'Bhubaneswar' },
    { phone: '9000000102', name: 'Priyanka Das', businessName: 'Jagannath Tours & Travels', city: 'Puri' },
    { phone: '9000000103', name: 'Rakesh Patnaik', businessName: 'Royal Wedding Wheels', city: 'Cuttack' },
  ];
  const ownerIds: string[] = [];
  for (const o of owners) {
    const u = await prisma.user.upsert({
      where: { phone: o.phone },
      update: {},
      create: { phone: o.phone, name: o.name, role: 'OWNER', status: 'ACTIVE', owner: { create: { businessName: o.businessName, contactPerson: o.name, city: o.city, state: 'Odisha', kycStatus: 'APPROVED', bankAccountName: o.businessName, bankAccountNumber: '000123456789', bankIfsc: 'SBIN0000001' } } },
      include: { owner: true },
    });
    ownerIds.push(u.owner!.id);
  }

  // ── Demo drivers (verified) ──
  const drivers = [
    ['9000000201', 'Bikash Nayak', 'OD0220150012345', 9, ['Odia', 'Hindi', 'English'], 0],
    ['9000000202', 'Manoj Sahu', 'OD0520120067890', 12, ['Odia', 'Hindi'], 0],
    ['9000000203', 'Suresh Behera', 'OD1320180023456', 6, ['Odia', 'Hindi', 'Telugu'], 1],
    ['9000000204', 'Ajit Pradhan', 'OD0220160034567', 8, ['Odia', 'Hindi', 'Bengali'], 2],
    ['9000000205', 'Deepak Swain', 'OD0520190045678', 5, ['Odia', 'Hindi', 'English'], 2],
  ] as const;
  const driverIds: string[] = [];
  for (const [phone, name, licence, exp, langs, ownerIdx] of drivers) {
    const u = await prisma.user.upsert({
      where: { phone },
      update: {},
      create: {
        phone, name, role: 'DRIVER', status: 'ACTIVE',
        driver: { create: { licenceNumber: licence, licenceExpiry: inYears(6), experienceYears: exp, languages: [...langs], verificationStatus: 'APPROVED', ownerId: ownerIds[ownerIdx], cityId: cities.Bhubaneswar, dailyWage: 900 } },
      },
      include: { driver: true },
    });
    driverIds.push(u.driver!.id);
  }

  // ── Demo vehicles ──
  type V = { model: string; reg: string; owner: number; city: string; year: number; color: string; perKm: number; perDay: number; perHour: number; driver?: number; opt?: DriverOption; deco?: boolean; featured?: boolean; selfDrive?: number; features?: string[] };
  const vehicles: V[] = [
    { model: 'Maruti Suzuki Swift', reg: 'OD02AB1201', owner: 0, city: 'Bhubaneswar', year: 2023, color: 'Pearl White', perKm: 10, perDay: 1800, perHour: 220, opt: 'BOTH', selfDrive: 1500, driver: 0 },
    { model: 'Hyundai Grand i10', reg: 'OD02AC4410', owner: 0, city: 'Bhubaneswar', year: 2022, color: 'Fiery Red', perKm: 10, perDay: 1800, perHour: 220, opt: 'SELF_DRIVE', selfDrive: 1400 },
    { model: 'Tata Tiago', reg: 'OD05BD7781', owner: 1, city: 'Puri', year: 2023, color: 'Arizona Blue', perKm: 9, perDay: 1700, perHour: 200, driver: 1 },
    { model: 'Maruti Suzuki Dzire', reg: 'OD02BE2290', owner: 0, city: 'Bhubaneswar', year: 2024, color: 'Silky Silver', perKm: 12, perDay: 2200, perHour: 260, driver: 0, featured: true },
    { model: 'Honda City', reg: 'OD02CF3345', owner: 0, city: 'Bhubaneswar', year: 2024, color: 'Platinum White', perKm: 14, perDay: 2800, perHour: 320, opt: 'BOTH', selfDrive: 2400, driver: 0, featured: true },
    { model: 'Hyundai Verna', reg: 'OD05CG8812', owner: 1, city: 'Puri', year: 2023, color: 'Titan Grey', perKm: 14, perDay: 2800, perHour: 320, driver: 1 },
    { model: 'Maruti Suzuki Ertiga', reg: 'OD02DH5567', owner: 0, city: 'Bhubaneswar', year: 2023, color: 'Magma Grey', perKm: 14, perDay: 3000, perHour: 340, driver: 0 },
    { model: 'Toyota Innova Crysta', reg: 'OD02EJ9001', owner: 1, city: 'Bhubaneswar', year: 2024, color: 'Super White', perKm: 18, perDay: 4200, perHour: 450, driver: 1, deco: true, featured: true },
    { model: 'Kia Carens', reg: 'OD05EK1123', owner: 1, city: 'Puri', year: 2024, color: 'Imperial Blue', perKm: 16, perDay: 3600, perHour: 400, driver: 1 },
    { model: 'Mahindra XUV700', reg: 'OD02FL4456', owner: 2, city: 'Cuttack', year: 2024, color: 'Midnight Black', perKm: 20, perDay: 4800, perHour: 500, driver: 2, deco: true },
    { model: 'Mahindra Scorpio', reg: 'OD14FM7789', owner: 2, city: 'Rourkela', year: 2023, color: 'Napoli Black', perKm: 17, perDay: 3800, perHour: 420, driver: 2 },
    { model: 'Hyundai Creta', reg: 'OD02FN2234', owner: 0, city: 'Bhubaneswar', year: 2024, color: 'Abyss Black', perKm: 16, perDay: 3500, perHour: 380, opt: 'BOTH', selfDrive: 3000, driver: 0 },
    { model: 'Toyota Camry Hybrid', reg: 'OD02GP1001', owner: 2, city: 'Bhubaneswar', year: 2024, color: 'Attitude Black', perKm: 35, perDay: 9000, perHour: 1100, driver: 3, deco: true, featured: true },
    { model: 'BMW 5 Series', reg: 'OD02GQ5005', owner: 2, city: 'Bhubaneswar', year: 2023, color: 'Carbon Black', perKm: 55, perDay: 15000, perHour: 1800, driver: 3, deco: true, featured: true },
    { model: 'Mercedes-Benz E-Class', reg: 'OD02GR7007', owner: 2, city: 'Cuttack', year: 2024, color: 'Polar White', perKm: 60, perDay: 16000, perHour: 2000, driver: 4, deco: true },
    { model: 'Audi A6', reg: 'OD02GS6006', owner: 2, city: 'Bhubaneswar', year: 2023, color: 'Glacier White', perKm: 55, perDay: 15000, perHour: 1800, driver: 4, deco: true },
    { model: 'Mercedes-Benz S-Class', reg: 'OD02HT9999', owner: 2, city: 'Bhubaneswar', year: 2024, color: 'Obsidian Black', perKm: 90, perDay: 28000, perHour: 3500, driver: 3, deco: true, featured: true, features: ['Floral decoration', 'Red carpet', 'Chauffeur in uniform', 'Champagne-free welcome drinks'] },
    { model: 'Heritage Motors Vintage Convertible', reg: 'OD02HU1950', owner: 2, city: 'Cuttack', year: 1962, color: 'Ivory', perKm: 80, perDay: 25000, perHour: 4000, driver: 4, deco: true, featured: true, features: ['Open-top grand entry', 'Classic floral décor', 'Photo-shoot stops'] },
    { model: 'Toyota Fortuner', reg: 'OD02HV4444', owner: 2, city: 'Bhubaneswar', year: 2024, color: 'Phantom Brown', perKm: 28, perDay: 7000, perHour: 800, driver: 2, deco: true },
    { model: 'Force Traveller 12 Seater', reg: 'OD02JW1212', owner: 1, city: 'Bhubaneswar', year: 2023, color: 'White', perKm: 22, perDay: 5500, perHour: 600, driver: 1 },
    { model: 'Force Traveller 17 Seater', reg: 'OD05JX1717', owner: 1, city: 'Puri', year: 2023, color: 'White', perKm: 26, perDay: 6500, perHour: 700, driver: 1 },
    { model: 'Force Traveller 26 Seater', reg: 'OD02JY2626', owner: 0, city: 'Bhubaneswar', year: 2022, color: 'White', perKm: 34, perDay: 8500, perHour: 900, driver: 0 },
    { model: 'Volvo Luxury Coach 45 Seater', reg: 'OD02KZ4545', owner: 0, city: 'Bhubaneswar', year: 2023, color: 'Royal Blue', perKm: 75, perDay: 22000, perHour: 2500, driver: 0, features: ['Push-back seats', 'Onboard washroom', 'PA system', 'LED TV'] },
  ];
  for (const v of vehicles) {
    const { id: modelId, m } = model[v.model];
    const isLux = ['Luxury Cars', 'Wedding Special'].includes(m[2]);
    const isGroup = m[2] === 'Traveller & Group';
    const title = `${v.model}${m[2] === 'Wedding Special' ? ' – Wedding Edition' : ''}`;
    await prisma.vehicle.upsert({
      where: { registrationNumber: v.reg },
      update: {},
      create: {
        ownerId: ownerIds[v.owner],
        categoryId: cat[m[2]],
        modelId,
        cityId: cities[v.city],
        defaultDriverId: v.driver != null ? driverIds[v.driver] : null,
        title,
        slug: `${slug(title)}-${v.reg.toLowerCase().slice(-4)}`,
        registrationNumber: v.reg,
        year: v.year,
        color: v.color,
        seats: m[3],
        luggageBags: m[4],
        hasAc: true,
        fuelType: m[5],
        transmission: m[6],
        driverOption: v.opt ?? 'WITH_DRIVER',
        description: `${v.year} ${v.model} in ${v.color}, professionally maintained and sanitised before every trip. ${isLux ? 'Ideal for weddings, VIP guests and corporate travel.' : isGroup ? 'Perfect for group tours, pilgrimages and wedding guest transport.' : 'A comfortable choice for city rides, airport transfers and outstation trips.'}`,
        features: v.features ?? (isLux ? ['Leather seats', 'Climate control', 'Bottled water', 'Phone charger', 'Uniformed chauffeur'] : isGroup ? ['Push-back seats', 'Music system', 'Ample luggage space', 'First-aid kit'] : ['Music system', 'Phone charger', 'Bottled water', 'First-aid kit']),
        status: 'ACTIVE',
        isFeatured: v.featured ?? false,
        decorationAvailable: v.deco ?? false,
        insuranceExpiry: inYears(1),
        fitnessExpiry: inYears(2),
        pollutionExpiry: inYears(1),
        permitType: isGroup ? 'All India Tourist Permit' : 'State Tourist Permit',
        permitNumber: `OD/TP/${v.reg.slice(-4)}`,
        permitExpiry: inYears(2),
        perKmRate: v.perKm,
        perDayRate: v.perDay,
        perHourRate: v.perHour,
        minBookingHours: isLux ? 4 : isGroup ? 8 : 4,
        includedKmPerDay: 250,
        includedKmPerHour: 10,
        extraKmRate: v.perKm + 2,
        extraHourRate: Math.round(v.perHour * 0.6),
        driverAllowancePerDay: isGroup ? 500 : 350,
        nightChargePerNight: isGroup ? 400 : 300,
        decorationCharge: v.deco ? (isLux ? 7500 : 4500) : 0,
        securityDeposit: v.opt && v.opt !== 'WITH_DRIVER' ? 5000 : 0,
        selfDrivePerDayRate: v.selfDrive ?? null,
        ratingAvg: 0,
        ratingCount: 0,
      },
    });
  }

  // ── Wedding packages ──
  const wedding = [
    { name: 'Silver Wedding Package', tier: 'SILVER', tagline: 'Elegant and affordable', basePrice: 14999, includedHours: 8, includedKm: 80, vehicleCount: 1, inclusions: ['1 decorated premium sedan for the couple', 'Fresh flower decoration', 'Uniformed chauffeur', '8 hours / 80 km'], vehicleHighlights: ['Honda City / Hyundai Verna'] },
    { name: 'Gold Wedding Package', tier: 'GOLD', tagline: 'Our most popular choice', basePrice: 34999, includedHours: 10, includedKm: 100, vehicleCount: 3, inclusions: ['Decorated luxury car for the couple', '2 Innova Crysta for family', 'Premium floral décor', 'Red-carpet welcome', '10 hours / 100 km'], vehicleHighlights: ['Toyota Camry / Fortuner', 'Innova Crysta ×2'] },
    { name: 'Premium Wedding Package', tier: 'PREMIUM', tagline: 'Make a grand entrance', basePrice: 74999, includedHours: 12, includedKm: 120, vehicleCount: 6, inclusions: ['BMW / Mercedes / Audi for the couple', 'Separate decorated car for bride & groom', '4 SUVs for family', '1 Tempo Traveller for guests', 'Wedding coordinator on call'], vehicleHighlights: ['BMW 5 Series / E-Class', 'Fortuner', 'Innova Crysta', 'Force Traveller'] },
    { name: 'Luxury Wedding Package', tier: 'LUXURY', tagline: 'Royal treatment, end to end', basePrice: 149999, includedHours: 14, includedKm: 150, vehicleCount: 10, inclusions: ['Mercedes S-Class or Vintage convertible entry', 'Bride & groom cars with designer décor', '6 luxury SUVs for VIP family', '2 coaches for guests', 'Pre-wedding & reception transport', 'Dedicated fleet manager'], vehicleHighlights: ['Mercedes S-Class', 'Vintage Convertible', 'Fortuner fleet', 'Volvo coach'] },
  ] as const;
  for (const [i, w] of wedding.entries()) {
    const existing = await prisma.weddingPackage.findFirst({ where: { tier: w.tier } });
    if (!existing) await prisma.weddingPackage.create({ data: { ...w, inclusions: [...w.inclusions], vehicleHighlights: [...w.vehicleHighlights], slug: slug(w.name), sortOrder: i, extraHourRate: 500 * (i + 1), extraKmRate: 20 * (i + 1), description: `${w.tagline}. Fully customisable — add vehicles, events and décor as you like.` } });
  }

  // ── Travel packages ──
  const travel = [
    { title: 'Puri – Konark – Chilika Golden Triangle', type: 'ODISHA_TOUR', destination: 'Puri, Konark, Chilika', durationDays: 3, durationNights: 2, basePrice: 12999, estimatedKm: 420, cat: 'Sedan Cars', featured: true, highlights: ['Jagannath Temple darshan', 'Sun Temple, Konark (UNESCO)', 'Dolphin spotting at Satapada', 'Chandrabhaga beach sunrise'], itinerary: [['Bhubaneswar → Puri', 'Drive to Puri, Jagannath Temple darshan and evening at Golden Beach.', ['Jagannath Temple', 'Golden Beach']], ['Konark day trip', 'Sunrise at Chandrabhaga, Sun Temple, Ramachandi beach.', ['Chandrabhaga', 'Konark Sun Temple', 'Ramachandi']], ['Chilika → Bhubaneswar', 'Boat ride at Satapada for Irrawaddy dolphins, return to Bhubaneswar.', ['Satapada', 'Chilika Lake']]] },
    { title: 'Bhubaneswar Temple City Sightseeing', type: 'CITY_SIGHTSEEING', destination: 'Bhubaneswar', durationDays: 1, durationNights: 0, basePrice: 2999, estimatedKm: 80, cat: 'Sedan Cars', featured: true, highlights: ['Lingaraj Temple', 'Udayagiri & Khandagiri caves', 'Dhauli Shanti Stupa', 'Nandankanan Zoo'], itinerary: [['Full-day city tour', 'Lingaraj, Mukteswar, Rajarani temples, Udayagiri–Khandagiri caves, Dhauli and Nandankanan.', ['Lingaraj', 'Mukteswar', 'Udayagiri', 'Dhauli', 'Nandankanan']]] },
    { title: 'Daringbadi Hill Weekend', type: 'WEEKEND_TRIP', destination: 'Daringbadi', durationDays: 2, durationNights: 1, basePrice: 9999, estimatedKm: 560, cat: 'SUV & MUV', featured: true, highlights: ['"Kashmir of Odisha"', 'Pine forests & coffee gardens', 'Midubanda waterfall'], itinerary: [['Bhubaneswar → Daringbadi', 'Scenic drive via Phulbani; evening at the pine forest.', ['Phulbani', 'Pine Forest']], ['Sightseeing & return', 'Coffee garden, Midubanda waterfall, Hill View Park; return.', ['Coffee Garden', 'Midubanda Falls']]] },
    { title: 'Simlipal National Park Safari', type: 'OUTSTATION', destination: 'Simlipal', durationDays: 3, durationNights: 2, basePrice: 18999, estimatedKm: 640, cat: 'SUV & MUV', featured: false, highlights: ['Tiger reserve safari', 'Barehipani & Joranda falls', 'Tribal villages'], itinerary: [['Bhubaneswar → Baripada', 'Drive to Baripada; evening at leisure.', ['Baripada']], ['Simlipal safari', 'Full-day safari: Barehipani and Joranda waterfalls.', ['Barehipani Falls', 'Joranda Falls']], ['Return', 'Morning tribal village visit; return to Bhubaneswar.', ['Tribal village']]] },
    { title: 'Gopalpur-on-Sea Family Getaway', type: 'FAMILY_VACATION', destination: 'Gopalpur', durationDays: 3, durationNights: 2, basePrice: 13999, estimatedKm: 400, cat: 'SUV & MUV', featured: false, highlights: ['Quiet golden beaches', 'Taptapani hot springs', 'Chilika at Barkul'], itinerary: [['Bhubaneswar → Gopalpur', 'En route Barkul (Chilika); evening at the beach.', ['Barkul']], ['Taptapani day trip', 'Hot springs and forest drive.', ['Taptapani']], ['Return', 'Morning lighthouse visit; return.', ['Gopalpur Lighthouse']]] },
    { title: 'Visakhapatnam & Araku Valley', type: 'OUTSTATION', destination: 'Vizag, Araku', durationDays: 4, durationNights: 3, basePrice: 26999, estimatedKm: 1100, cat: 'SUV & MUV', featured: false, highlights: ['RK Beach', 'Borra Caves', 'Araku coffee plantations'], itinerary: [['Bhubaneswar → Vizag', 'Long drive to Visakhapatnam.', ['RK Beach']], ['Vizag sightseeing', 'Kailasagiri, Submarine Museum, Rushikonda.', ['Kailasagiri', 'Rushikonda']], ['Araku Valley', 'Borra Caves, coffee museum, Padmapuram gardens.', ['Borra Caves', 'Araku']], ['Return', 'Return to Bhubaneswar.', []]] },
  ] as const;
  for (const t of travel) {
    const s = slug(t.title);
    const exists = await prisma.travelPackage.findUnique({ where: { slug: s } });
    if (exists) continue;
    await prisma.travelPackage.create({
      data: {
        title: t.title, slug: s, type: t.type, destination: t.destination, durationDays: t.durationDays, durationNights: t.durationNights,
        summary: t.highlights.slice(0, 2).join(' · '), description: `${t.title}: a ${t.durationDays}-day chauffeur-driven trip from Bhubaneswar with flexible pickup timings.`,
        highlights: [...t.highlights], inclusions: ['AC vehicle with driver', 'Fuel, tolls and parking', 'Driver allowance & night charges', 'GST'], exclusions: ['Hotel stay & meals', 'Entry tickets', 'Boat / safari charges'],
        basePrice: t.basePrice, estimatedKm: t.estimatedKm, minPassengers: 1, maxPassengers: t.cat === 'Sedan Cars' ? 4 : 7, recommendedCategoryId: cat[t.cat], isPublished: true, isFeatured: t.featured,
        itinerary: { create: t.itinerary.map(([title, description, places], i) => ({ dayNumber: i + 1, title, description, places: [...places] })) },
      },
    });
  }

  // ── Destinations ──
  const dests = [
    ['Puri', 'Jagannath Dham & golden beaches', 60, 2499],
    ['Konark', 'The 13th-century Sun Temple', 65, 2699],
    ['Chilika Lake', "Asia's largest brackish lagoon", 100, 3499],
    ['Daringbadi', 'The hill station of Odisha', 250, 7999],
    ['Simlipal', 'Tiger reserve & waterfalls', 260, 8999],
    ['Gopalpur', 'Serene seaside escape', 180, 5999],
  ] as const;
  for (const [i, [name, tagline, km, fare]] of dests.entries()) {
    await prisma.destination.upsert({ where: { slug: slug(name) }, update: {}, create: { name, slug: slug(name), state: 'Odisha', tagline, distanceKm: km, startingFare: fare, sortOrder: i } });
  }

  // ── Testimonials ──
  if ((await prisma.testimonial.count()) === 0) {
    await prisma.testimonial.createMany({
      data: [
        { name: 'Ananya & Rohit', location: 'Bhubaneswar', occasion: 'Wedding', rating: 5, quote: 'The decorated Mercedes arrived 30 minutes early and the guest travellers ran like clockwork. Our families still talk about the grand entry!', sortOrder: 0 },
        { name: 'Subhashree Panda', location: 'Cuttack', occasion: 'Family trip', rating: 5, quote: 'Booked an Innova Crysta for Puri–Konark. Spotless car, polite driver and the price was exactly what the website showed.', sortOrder: 1 },
        { name: 'Arvind Rao', location: 'Hyderabad', occasion: 'Corporate', rating: 5, quote: 'We moved 60 delegates across three days with zero hiccups. Invoices with GST were ready the same evening.', sortOrder: 2 },
        { name: 'Meera Mishra', location: 'Rourkela', occasion: 'Airport transfer', rating: 4, quote: 'Early morning flight, driver was waiting with a name board. Smooth and on time.', sortOrder: 3 },
      ],
    });
  }

  // ── Coupons ──
  const now = new Date();
  const coupons = [
    { code: 'WELCOME10', title: '10% off your first ride', description: 'Up to ₹750 off on your first booking.', discountType: 'PERCENT', value: 10, maxDiscount: 750, minOrderAmount: 1500, perUserLimit: 1, isFeatured: true, purposes: [] },
    { code: 'SHAADI2500', title: '₹2,500 off wedding bookings', description: 'Flat ₹2,500 off on wedding bookings above ₹20,000.', discountType: 'FLAT', value: 2500, minOrderAmount: 20000, perUserLimit: 2, isFeatured: true, purposes: ['WEDDING'] },
    { code: 'WEEKEND15', title: '15% off weekend getaways', description: 'Family and outstation trips, up to ₹1,500 off.', discountType: 'PERCENT', value: 15, maxDiscount: 1500, minOrderAmount: 5000, perUserLimit: 3, isFeatured: true, purposes: ['FAMILY_TRIP', 'OUTSTATION'] },
  ] as const;
  for (const c of coupons) {
    await prisma.coupon.upsert({ where: { code: c.code }, update: {}, create: { ...c, purposes: [...c.purposes], validFrom: now, validTo: new Date(now.getTime() + 180 * 86_400_000) } });
  }

  // ── Pricing rules ──
  if ((await prisma.pricingRule.count()) === 0) {
    await prisma.pricingRule.createMany({
      data: [
        { name: 'Weekend demand', type: 'WEEKEND', daysOfWeek: [0, 6], multiplier: 1.1, priority: 1 },
        { name: 'Wedding season', type: 'SEASONAL', categoryId: cat['Wedding Special'], startDate: new Date(Date.UTC(year, 10, 1)), endDate: new Date(Date.UTC(year + 1, 1, 28)), multiplier: 1.15, priority: 2 },
        { name: 'Rath Yatra peak', type: 'PEAK_DATE', startDate: new Date(Date.UTC(year + 1, 5, 25)), endDate: new Date(Date.UTC(year + 1, 6, 5)), multiplier: 1.25, priority: 3 },
        { name: 'Andhra Pradesh entry tax', type: 'STATE_TAX', state: 'Andhra Pradesh', flatAmount: 1200, priority: 0 },
        { name: 'West Bengal entry tax', type: 'STATE_TAX', state: 'West Bengal', flatAmount: 1000, priority: 0 },
        { name: 'Chhattisgarh entry tax', type: 'STATE_TAX', state: 'Chhattisgarh', flatAmount: 900, priority: 0 },
        { name: 'Waiting charges', type: 'WAITING', config: { freeMinutes: 30, perHour: 200 }, priority: 0 },
      ],
    });
  }

  // ── CMS pages ──
  const pages = [
    ['terms', 'Terms & Conditions', '## 1. Bookings\nA booking is confirmed only after the advance payment is received. Vehicles are reserved for 20 minutes while payment is pending.\n\n## 2. Charges\nThe fare shown at checkout includes base fare, applicable surcharges and GST. Tolls, parking and interstate permit taxes are charged at actuals.\n\n## 3. Customer responsibilities\nPassengers must not exceed the seating capacity. Smoking and alcohol consumption inside vehicles is prohibited. Damage caused by passengers is chargeable.\n\n## 4. Self-drive rentals\nA valid driving licence and government ID are mandatory. A refundable security deposit is collected at pickup.\n\n## 5. Liability\nRoyal Ride acts as a marketplace connecting customers with verified vehicle partners and is not liable for delays caused by traffic, weather or events beyond reasonable control.'],
    ['privacy', 'Privacy Policy', '## What we collect\nYour name, mobile number, email, pickup and drop addresses, and payment references. We never store card or UPI credentials — payments are processed by RBI-regulated gateways.\n\n## How we use it\nTo fulfil bookings, share trip details with your assigned driver and vehicle partner, send booking updates by SMS/WhatsApp/email, and comply with tax laws.\n\n## Sharing\nDrivers and partners see only what they need for your trip. We do not sell personal data.\n\n## Your rights\nYou can view and update your profile at any time, and request deletion of your account by contacting support.'],
    ['cancellation-policy', 'Cancellation & Refund Policy', '| Cancelled before pickup | Refund of amount paid |\n|---|---|\n| 72 hours or more | 100% |\n| 24 – 72 hours | 75% |\n| 6 – 24 hours | 50% |\n| Less than 6 hours | No refund |\n\nRefunds are credited to the original payment method within 5–7 working days. If a partner cancels or we cannot provide a vehicle, you receive a 100% refund. Wedding packages may carry custom terms mentioned in your quotation.'],
    ['about', 'About Royal Ride', 'Royal Ride is Odisha\'s premium marketplace for wedding cars, family tours, airport transfers and corporate travel. Every vehicle partner and driver is verified, every fare is transparent, and every trip is backed by 24×7 support.'],
  ] as const;
  for (const [s, title, body] of pages) {
    await prisma.page.upsert({ where: { slug: s }, update: {}, create: { slug: s, title, body } });
  }

  await prisma.contentBlock.upsert({
    where: { key: 'home.hero' },
    update: {},
    create: { key: 'home.hero', data: { heading: 'Your Journey, Our Responsibility', subheading: 'Book Your Perfect Ride for Weddings, Holidays and Every Special Occasion', badge: "Odisha's trusted wedding & travel fleet" } },
  });
  await prisma.contentBlock.upsert({
    where: { key: 'home.stats' },
    update: {},
    create: { key: 'home.stats', data: { items: [{ label: 'Happy customers', value: '25,000+' }, { label: 'Weddings served', value: '1,800+' }, { label: 'Verified vehicles', value: '450+' }, { label: 'Cities', value: '12' }] } },
  });

  console.log('Seed complete.');
  console.log(`Admin login: ${adminEmail} / ${process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345'}`);
  console.log('Demo owner phones: 9000000101-103 · Demo driver phones: 9000000201-205 (OTP via console / DEV_FIXED_OTP)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
