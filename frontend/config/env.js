const isProd = process.env.NODE_ENV === 'production';

const env = {
  NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL,
  NEXT_PUBLIC_STOCKBOT_URL: process.env.NEXT_PUBLIC_STOCKBOT_URL,
  MODEL_NAME: process.env.NEXT_PUBLIC_MODEL_NAME,
  FORMAT_TYPE: process.env.NEXT_PUBLIC_FORMAT_TYPE,
  IS_PROD: isProd,
};

// Optional: Add fallback suggestions or defaults (only for development)
if (!env.NEXT_PUBLIC_BACKEND_URL || !env.NEXT_PUBLIC_STOCKBOT_URL) {
  throw new Error(
    "❌ Missing one or more required frontend env vars: NEXT_PUBLIC_API_URL, MODEL_NAME, FORMAT_TYPE"
  );
}

export default env;
