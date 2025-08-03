import express from 'express';
import https from 'https';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import corsOptions from './config/corsOptions.js';
import connectDB from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import jarvisRoutes from './routes/jarvisRoutes.js';
import schwabRoutes from './routes/schwabRoutes.js';
import alpacaRoutes from './routes/alpacaRoutes.js';
import brokerRoutes from './routes/brokerRoutes.js';

// Load environment variables
dotenv.config();

connectDB();



const app = express();


app.use((req, res, next) => {
  console.log(`📡 ${req.method} ${req.url} - Origin: ${req.headers.origin || "no origin"}`);
  next();
});
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());

// Root
app.get('/', (req, res) => {
  res.send('API is running securely over HTTPS 🚀');
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use("/api/jarvis", jarvisRoutes);
app.use('/api/schwab', schwabRoutes);
app.use('/api/alpaca', alpacaRoutes);
app.use('/api/broker', brokerRoutes);

// Get configuration from environment
const BACKEND_URL = process.env.BACKEND_URL;
const PORT = process.env.BACKEND_PORT;
const CERT_PATH = process.env.SSL_CERT 
const KEY_PATH = process.env.SSL_KEY 
const CA_PATH = process.env.SSL_CA 

// Read SSL credentials
const sslOptions = {
  key: fs.readFileSync(path.resolve(KEY_PATH)),
  cert: fs.readFileSync(path.resolve(CERT_PATH)),
  ca: fs.existsSync(path.resolve(CA_PATH)) ? fs.readFileSync(path.resolve(CA_PATH)) : undefined
};

// Create HTTPS server
https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`✅ Backend (HTTPS) running at ${BACKEND_URL}`);
});
