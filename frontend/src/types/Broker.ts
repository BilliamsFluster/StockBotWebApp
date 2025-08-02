// types/brokers.ts
export type BrokerId = string; // could be narrowed later if needed

export interface BrokerInfo {
  id: BrokerId;
  name: string;
  description: string;
  logo: string;
}
