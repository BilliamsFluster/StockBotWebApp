import axios from 'axios';
import User from '../models/User.js';
import { getBrokerCredentials } from '../config/getBrokerCredentials.js';

export async function getActiveBrokerPortfolio(req, res) {
  try {
    // 🔹 Get full Mongoose doc so instance methods work
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const activeBroker = user.preferences?.activeBroker;
    if (!activeBroker) {
      return res.status(400).json({ error: 'No active broker set' });
    }

    // 🔹 Get decrypted broker-specific credentials
    const credentials = await getBrokerCredentials(user, activeBroker);

    // 🔹 Call Python StockBot
    const botRes = await axios.post(
      `${process.env.STOCKBOT_URL}/api/stockbot/broker/portfolio`,
      {
        broker: activeBroker,
        credentials
      }
    );

    res.json(botRes.data);
  } catch (err) {
    console.error('❌ Error fetching active broker portfolio:', err.message);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
}