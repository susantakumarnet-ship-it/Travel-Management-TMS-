import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');
const str = z.string().optional().default('');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  OTP_TTL_SECONDS: z.coerce.number().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  DEV_FIXED_OTP: str,
  DISABLE_RATE_LIMITS: bool,

  SMS_DRIVER: z.enum(['console', 'msg91']).default('console'),
  MSG91_AUTH_KEY: str,
  MSG91_OTP_TEMPLATE_ID: str,
  MSG91_SENDER_ID: str,
  MSG91_FLOW_TEMPLATE_ID: str,

  WHATSAPP_DRIVER: z.enum(['console', 'cloud']).default('console'),
  WHATSAPP_PHONE_NUMBER_ID: str,
  WHATSAPP_ACCESS_TOKEN: str,
  WHATSAPP_TEMPLATE_LANG: z.string().default('en'),
  WHATSAPP_PUBLIC_NUMBER: z.string().default('919000000000'),

  EMAIL_DRIVER: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: str,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: str,
  SMTP_PASS: str,
  EMAIL_FROM: z.string().default('Royal Ride <bookings@example.com>'),

  PAYMENT_GATEWAY: z.enum(['razorpay', 'cashfree']).default('razorpay'),
  RAZORPAY_KEY_ID: str,
  RAZORPAY_KEY_SECRET: str,
  RAZORPAY_WEBHOOK_SECRET: str,
  CASHFREE_APP_ID: str,
  CASHFREE_SECRET_KEY: str,
  CASHFREE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  ALLOW_TEST_GATEWAY: bool,

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: str,
  S3_REGION: z.string().default('ap-south-1'),
  S3_ACCESS_KEY_ID: str,
  S3_SECRET_ACCESS_KEY: str,
  S3_PUBLIC_BASE_URL: str,

  GOOGLE_MAPS_API_KEY: str,

  COMPANY_NAME: z.string().default('Royal Ride Travels Pvt. Ltd.'),
  COMPANY_GSTIN: z.string().default(''),
  COMPANY_STATE: z.string().default('Odisha'),
  COMPANY_ADDRESS: z.string().default(''),
  COMPANY_PHONE: z.string().default(''),
  COMPANY_EMAIL: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

if (isProd) {
  if (env.ALLOW_TEST_GATEWAY) throw new Error('ALLOW_TEST_GATEWAY must not be enabled in production');
  if (env.DEV_FIXED_OTP) throw new Error('DEV_FIXED_OTP must not be set in production');
  if (env.DISABLE_RATE_LIMITS) throw new Error('DISABLE_RATE_LIMITS must not be set in production');
}
