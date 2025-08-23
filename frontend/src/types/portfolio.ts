export type Position = {
  symbol: string;
  qty: number;
  price: number;
  marketValue: number;
  dayPL: number;
  totalPL: number;
};

export type Transaction = {
  id: string | number;
  date: string;
  symbol: string;
  type: string;
  quantity: number;
  amount: number;
  price?: number;
};
