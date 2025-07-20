import express from 'express';
import { env } from './config/env.js'; 
import cors from 'cors';
import corsOptions from './config/corsOptions.js';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import cookieParser from 'cookie-parser';
import jarvisRoutes from './routes/jarvisRoutes.js';


connectDB();
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(cors(corsOptions));



// Root
app.get('/', (req, res) => {
  res.send('API is running...');
});



// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use("/api/jarvis", jarvisRoutes);

// Server
const PORT = env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
