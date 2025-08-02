import express from 'express';

import cors from 'cors';
import corsOptions from './config/corsOptions.js';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import cookieParser from 'cookie-parser';
import jarvisRoutes from './routes/jarvisRoutes.js';
import schwabRoutes from './routes/schwabRoutes.js';
import alpacaRoutes from './routes/alpacaRoutes.js'
import brokerRoutes from './routes/brokerRoutes.js';



connectDB();
const app = express();
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());



// Root
app.get('/', (req, res) => {
  res.send('API is running...');
});



// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use("/api/jarvis", jarvisRoutes);

app.use('/api/schwab', schwabRoutes);
app.use('/api/alpaca', alpacaRoutes);
app.use('/api/broker', brokerRoutes);

// Server
const PORT = process.env.BACKEND_PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));

