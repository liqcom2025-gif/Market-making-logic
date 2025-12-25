import type { SpreadConfig, InventoryState, MarketData, Quote } from './types';

const DEFAULT_SPREAD_CONFIG: SpreadConfig = {
  baseSpread: 0.002,
  minSpread: 0.0005,
  maxSpread: 0.02,
  volatilityMultiplier: 2.0,
  inventorySkewMultiplier: 0.5,
};

export class SpreadCalculator {
  private config: SpreadConfig;

  constructor(config: Partial<SpreadConfig> = {}) {
    this.config = { ...DEFAULT_SPREAD_CONFIG, ...config };
  }

  calculateOptimalSpread(
    marketData: MarketData,
    inventoryState: InventoryState
  ): { bidSpread: number; askSpread: number } {
    const baseSpread = this.calculateBaseSpread(marketData);
    const volatilityAdjustment = this.calculateVolatilityAdjustment(marketData.volatility);
    const inventorySkew = this.calculateInventorySkew(inventoryState);

    const totalSpread = Math.min(
      Math.max(baseSpread + volatilityAdjustment, this.config.minSpread),
      this.config.maxSpread
    );

    const halfSpread = totalSpread / 2;
    const bidSpread = halfSpread * (1 + inventorySkew);
    const askSpread = halfSpread * (1 - inventorySkew);

    return {
      bidSpread: Math.max(bidSpread, this.config.minSpread / 2),
      askSpread: Math.max(askSpread, this.config.minSpread / 2),
    };
  }

  private calculateBaseSpread(marketData: MarketData): number {
    const volumeFactor = Math.max(0.5, Math.min(2, 1000000 / (marketData.volume24h + 1)));
    return this.config.baseSpread * volumeFactor;
  }

  private calculateVolatilityAdjustment(volatility: number): number {
    const normalizedVolatility = Math.max(0, volatility - 0.01);
    return normalizedVolatility * this.config.volatilityMultiplier;
  }

  private calculateInventorySkew(inventoryState: InventoryState): number {
    const deviation = inventoryState.inventoryRatio - 0.5;
    return deviation * this.config.inventorySkewMultiplier * 2;
  }

  generateQuote(
    midPrice: number,
    marketData: MarketData,
    inventoryState: InventoryState,
    orderSize: number
  ): Quote {
    const { bidSpread, askSpread } = this.calculateOptimalSpread(marketData, inventoryState);

    const bidPrice = midPrice * (1 - bidSpread);
    const askPrice = midPrice * (1 + askSpread);

    const adjustedBidSize = this.adjustOrderSize(orderSize, inventoryState, 'bid');
    const adjustedAskSize = this.adjustOrderSize(orderSize, inventoryState, 'ask');

    return {
      bidPrice: this.roundToTickSize(bidPrice, 0.0001),
      bidSize: adjustedBidSize,
      askPrice: this.roundToTickSize(askPrice, 0.0001),
      askSize: adjustedAskSize,
      spread: askPrice - bidPrice,
      midPrice,
    };
  }

  private adjustOrderSize(
    baseSize: number,
    inventoryState: InventoryState,
    side: 'bid' | 'ask'
  ): number {
    const ratio = inventoryState.inventoryRatio;

    if (side === 'bid') {
      const factor = ratio > 0.5 ? 1 - (ratio - 0.5) * 0.8 : 1 + (0.5 - ratio) * 0.4;
      return baseSize * Math.max(0.2, Math.min(1.5, factor));
    } else {
      const factor = ratio < 0.5 ? 1 - (0.5 - ratio) * 0.8 : 1 + (ratio - 0.5) * 0.4;
      return baseSize * Math.max(0.2, Math.min(1.5, factor));
    }
  }

  private roundToTickSize(value: number, tickSize: number): number {
    return Math.round(value / tickSize) * tickSize;
  }

  updateConfig(config: Partial<SpreadConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): SpreadConfig {
    return { ...this.config };
  }
}

export function calculateEffectiveSpread(quote: Quote): number {
  return (quote.askPrice - quote.bidPrice) / quote.midPrice;
}

export function calculateMidPrice(bidPrice: number, askPrice: number): number {
  return (bidPrice + askPrice) / 2;
}

export function calculateWeightedMidPrice(
  bidPrice: number,
  bidSize: number,
  askPrice: number,
  askSize: number
): number {
  const totalSize = bidSize + askSize;
  if (totalSize === 0) return (bidPrice + askPrice) / 2;
  return (bidPrice * askSize + askPrice * bidSize) / totalSize;
}

export function estimateVolatility(prices: number[], period: number = 24): number {
  if (prices.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push(Math.log(prices[i] / prices[i - 1]));
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

  return Math.sqrt(variance * period);
}
