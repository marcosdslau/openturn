import { existsSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';

/** Deve ser o primeiro import em main.ts — antes de AppModule — para que BullMQ e o resto vejam o .env. */
const envPath =
  [join(__dirname, '..', '..', '.env'), join(__dirname, '..', '.env')].find(
    (p) => existsSync(p),
  ) ?? join(process.cwd(), '.env');
config({ path: envPath });
