// backend/config/corsOptions.js
const allowedOrigins = [
  `${process.env.FRONTEND_URL}`
  // Add more frontend origins as needed (e.g. production domains)
];
console.log("📦 corsOptions loaded");
const corsOptions = {
  origin: (origin, callback) => {
    console.log("🔍 CORS DEBUG:");
    console.log("   Incoming Origin:", origin);
    console.log("   Allowed Origins:", allowedOrigins);

    // Allow requests with no origin (Postman, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      console.log("   ✅ Allowed by CORS");
      callback(null, true);
    } else {
      console.log("   ❌ Blocked by CORS");
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};


export default corsOptions;
