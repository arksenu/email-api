import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  SENDGRID_API_KEY: z.string().startsWith('SG.'),
  FROM_DOMAIN: z.string().default('fly-bot.net'),
  RELAY_ADDRESS: z.string().email().default('relay@fly-bot.net'),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
