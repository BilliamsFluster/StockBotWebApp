// config/env.js
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve __dirname (ES module workaround)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Choose correct .env file
const envFile =
  process.env.NODE_ENV === 'production'
    ? '.env.production'
    : '.env.local';

// Load environment variables from the appropriate file
dotenv.config({ path: path.join(__dirname, `../${envFile}`) });

// Throw if required env vars are missing
if (!process.env.STOCKBOT_URL) {
  throw new Error("❌ Missing STOCKBOT_URL in your environment file!");
}

// Optional: add any other required checks here
// if (!process.env.SOME_OTHER_VAR) throw new Error("Missing SOME_OTHER_VAR");

// Export a clean env object and full process.env for fallback use
export const env = {
  STOCKBOT_URL: process.env.STOCKBOT_URL,
  PORT: process.env.PORT,
  // Add more individually if you like
};

export default process.env;
