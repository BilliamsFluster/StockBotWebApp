// config/brokersConfig.ts
import { BrokerInfo } from '@/types/Broker';

export const brokersList: BrokerInfo[] = [
  {
    id: 'alpaca',
    name: 'Alpaca',
    description: 'Trading API for stocks and crypto.',
    logo: '/alpaca-logo.svg',
  },
  {
    id: 'schwab',
    name: 'Charles Schwab',
    description: 'Direct brokerage account trading.',
    logo: '/schwab-logo.svg',
  },
  // ✅ In the future, just add another object here
];
