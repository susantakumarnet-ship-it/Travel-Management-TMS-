import crypto from 'node:crypto';

// ── Pagination ──
export function paginate(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
export function pageResult<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

// ── Money ──
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const toPaise = (rupees: number) => Math.round(rupees * 100);
export const fromPaise = (paise: number) => round2(paise / 100);
export const num = (d: unknown): number => (d == null ? 0 : typeof d === 'number' ? d : Number(d));
export const formatINR = (n: number) =>
  'Rs. ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ── Time (India has no DST: IST = UTC+05:30) ──
export const IST_OFFSET_MIN = 330;
export function toIstWall(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MIN * 60_000);
}
export const istHour = (d: Date) => toIstWall(d).getUTCHours();
export const istDay = (d: Date) => toIstWall(d).getUTCDay();
export const istDateKey = (d: Date) => toIstWall(d).toISOString().slice(0, 10);
export function startOfIstDay(d: Date): Date {
  const w = toIstWall(d);
  w.setUTCHours(0, 0, 0, 0);
  return new Date(w.getTime() - IST_OFFSET_MIN * 60_000);
}
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
export const addMinutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);
export const formatIst = (d: Date) =>
  d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
export const formatIstDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' });

// ── Crypto ──
export const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');
export const randomOtp = () => crypto.randomInt(100000, 1000000).toString();
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
export const hmacHex = (secret: string, data: string | Buffer) =>
  crypto.createHmac('sha256', secret).update(data).digest('hex');
export const hmacBase64 = (secret: string, data: string | Buffer) =>
  crypto.createHmac('sha256', secret).update(data).digest('base64');

// ── Strings ──
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
}
export const shortId = () => crypto.randomBytes(3).toString('hex');
export const maskPhone = (p: string) => (p.length >= 10 ? `${p.slice(0, 2)}XXXXXX${p.slice(-2)}` : p);

/** First instant of the current IST calendar month. */
export function istMonthStart(d = new Date()): Date {
  const w = toIstWall(d);
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), 1) - IST_OFFSET_MIN * 60_000);
}
