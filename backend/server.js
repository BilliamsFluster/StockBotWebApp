import express from 'express';
import { env } from './config/env.js'; 
import cors from 'cors';
import corsOptions from './config/corsOptions.js';
import connectDB from './config/db.js';
import cookieParser from 'cookie-parser';
import apiRoutes from './routes/index.js';


connectDB();
const app = express();
const API_VERSION = 'v1';
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json());



// Root
app.get('/', (req, res) => {
  res.send('API is running...');
});



// Routes
app.use(`/api/${API_VERSION}`, apiRoutes);


// Server
const PORT = env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));

