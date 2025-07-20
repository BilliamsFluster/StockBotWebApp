// backend/config/corsOptions.js
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  // Add more frontend origins as needed (e.g. production domains)
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200, // for legacy browsers
};

export default corsOptions;
