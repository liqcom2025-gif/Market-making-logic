export interface OrderBookEntry {
  price: number;
  size: number;
  side: 'bid' | 'ask';
}

export interface OrderBook {
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  timestamp: number;
}

export interface Quote {
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  spread: number;
  midPrice: number;
}

export interface Position {
  baseBalance: number;
  quoteBalance: number;
  netExposure: number;
  unrealizedPnL: number;
}

export interface InventoryState {
  currentInventory: number;
  targetInventory: number;
  inventoryRatio: number;
  skewFactor: number;
  maxInventory: number;
  minInventory: number;
}

export interface SpreadConfig {
  baseSpread: number;
  minSpread: number;
  maxSpread: number;
  volatilityMultiplier: number;
  inventorySkewMultiplier: number;
}

export interface InventoryConfig {
  targetInventory: number;
  maxInventory: number;
  minInventory: number;
  rebalanceThreshold: number;
  skewSensitivity: number;
}

export interface MarketMakerConfig {
  spread: SpreadConfig;
  inventory: InventoryConfig;
  orderSize: number;
  maxOrderSize: number;
  minOrderSize: number;
  priceTickSize: number;
  sizeTickSize: number;
  updateIntervalMs: number;
}

export interface Trade {
  id: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  timestamp: number;
  fee: number;
}

export interface MarketData {
  symbol: string;
  lastPrice: number;
  bidPrice: number;
  askPrice: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  volatility: number;
}

export interface PoolState {
  tokenAReserve: number;
  tokenBReserve: number;
  totalLiquidity: number;
  lpTokenSupply: number;
  fee: number;
  lastUpdate: number;
}

export interface LiquidityPosition {
  lpTokens: number;
  shareOfPool: number;
  tokenAAmount: number;
  tokenBAmount: number;
  entryPrice: number;
  currentValue: number;
  impermanentLoss: number;
}

export interface SwapResult {
  amountIn: number;
  amountOut: number;
  priceImpact: number;
  fee: number;
  newPrice: number;
}

export interface AddLiquidityResult {
  lpTokensReceived: number;
  tokenADeposited: number;
  tokenBDeposited: number;
  shareOfPool: number;
}

export interface RemoveLiquidityResult {
  lpTokensBurned: number;
  tokenAReceived: number;
  tokenBReceived: number;
  fee: number;
}

export type OrderStatus = 'pending' | 'filled' | 'partial' | 'cancelled' | 'rejected';

export interface Order {
  id: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  filledSize: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
}

export interface MMStats {
  totalTrades: number;
  totalVolume: number;
  realizedPnL: number;
  unrealizedPnL: number;
  avgSpread: number;
  inventoryTurnover: number;
  uptime: number;
}
