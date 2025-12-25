import type { InventoryConfig, InventoryState, Position, Trade } from './types';

const DEFAULT_INVENTORY_CONFIG: InventoryConfig = {
  targetInventory: 0,
  maxInventory: 1000,
  minInventory: -1000,
  rebalanceThreshold: 0.3,
  skewSensitivity: 1.5,
};

export class InventoryController {
  private config: InventoryConfig;
  private currentInventory: number = 0;
  private tradeHistory: Trade[] = [];
  private avgEntryPrice: number = 0;

  constructor(config: Partial<InventoryConfig> = {}) {
    this.config = { ...DEFAULT_INVENTORY_CONFIG, ...config };
  }

  getState(): InventoryState {
    const range = this.config.maxInventory - this.config.minInventory;
    const normalizedInventory = this.currentInventory - this.config.minInventory;
    const inventoryRatio = range > 0 ? normalizedInventory / range : 0.5;

    return {
      currentInventory: this.currentInventory,
      targetInventory: this.config.targetInventory,
      inventoryRatio: Math.max(0, Math.min(1, inventoryRatio)),
      skewFactor: this.calculateSkewFactor(),
      maxInventory: this.config.maxInventory,
      minInventory: this.config.minInventory,
    };
  }

  private calculateSkewFactor(): number {
    const deviation = this.currentInventory - this.config.targetInventory;
    const maxDeviation = Math.max(
      Math.abs(this.config.maxInventory - this.config.targetInventory),
      Math.abs(this.config.minInventory - this.config.targetInventory)
    );

    if (maxDeviation === 0) return 0;

    const normalizedDeviation = deviation / maxDeviation;
    return Math.tanh(normalizedDeviation * this.config.skewSensitivity);
  }

  updateInventory(trade: Trade): void {
    const previousInventory = this.currentInventory;

    if (trade.side === 'buy') {
      this.currentInventory += trade.size;
      this.updateAvgEntryPrice(trade.price, trade.size, 'buy');
    } else {
      this.currentInventory -= trade.size;
      this.updateAvgEntryPrice(trade.price, trade.size, 'sell');
    }

    this.tradeHistory.push(trade);

    if (this.tradeHistory.length > 1000) {
      this.tradeHistory = this.tradeHistory.slice(-500);
    }

    this.enforceInventoryLimits(previousInventory);
  }

  private updateAvgEntryPrice(price: number, size: number, side: 'buy' | 'sell'): void {
    if (side === 'buy' && this.currentInventory > 0) {
      const previousValue = this.avgEntryPrice * (this.currentInventory - size);
      const newValue = price * size;
      this.avgEntryPrice = (previousValue + newValue) / this.currentInventory;
    } else if (side === 'sell' && this.currentInventory < 0) {
      const previousValue = this.avgEntryPrice * Math.abs(this.currentInventory + size);
      const newValue = price * size;
      this.avgEntryPrice = (previousValue + newValue) / Math.abs(this.currentInventory);
    }
  }

  private enforceInventoryLimits(previousInventory: number): void {
    if (this.currentInventory > this.config.maxInventory) {
      console.warn(`Inventory exceeded max limit: ${this.currentInventory} > ${this.config.maxInventory}`);
      this.currentInventory = this.config.maxInventory;
    } else if (this.currentInventory < this.config.minInventory) {
      console.warn(`Inventory below min limit: ${this.currentInventory} < ${this.config.minInventory}`);
      this.currentInventory = this.config.minInventory;
    }
  }

  needsRebalancing(): boolean {
    const deviation = Math.abs(this.currentInventory - this.config.targetInventory);
    const range = this.config.maxInventory - this.config.minInventory;
    return deviation / range > this.config.rebalanceThreshold;
  }

  getRebalanceAmount(): number {
    return this.config.targetInventory - this.currentInventory;
  }

  calculatePosition(currentPrice: number): Position {
    const netExposure = this.currentInventory * currentPrice;
    const unrealizedPnL = this.currentInventory > 0
      ? this.currentInventory * (currentPrice - this.avgEntryPrice)
      : this.currentInventory < 0
        ? Math.abs(this.currentInventory) * (this.avgEntryPrice - currentPrice)
        : 0;

    return {
      baseBalance: this.currentInventory,
      quoteBalance: -netExposure,
      netExposure,
      unrealizedPnL,
    };
  }

  shouldAcceptOrder(side: 'buy' | 'sell', size: number): boolean {
    if (side === 'buy') {
      return this.currentInventory + size <= this.config.maxInventory;
    } else {
      return this.currentInventory - size >= this.config.minInventory;
    }
  }

  getMaxOrderSize(side: 'buy' | 'sell'): number {
    if (side === 'buy') {
      return Math.max(0, this.config.maxInventory - this.currentInventory);
    } else {
      return Math.max(0, this.currentInventory - this.config.minInventory);
    }
  }

  getInventoryUtilization(): number {
    const used = Math.abs(this.currentInventory - this.config.targetInventory);
    const available = Math.max(
      Math.abs(this.config.maxInventory - this.config.targetInventory),
      Math.abs(this.config.minInventory - this.config.targetInventory)
    );
    return available > 0 ? used / available : 0;
  }

  getTradeStats(): { count: number; buyVolume: number; sellVolume: number; netVolume: number } {
    let buyVolume = 0;
    let sellVolume = 0;

    for (const trade of this.tradeHistory) {
      if (trade.side === 'buy') {
        buyVolume += trade.size;
      } else {
        sellVolume += trade.size;
      }
    }

    return {
      count: this.tradeHistory.length,
      buyVolume,
      sellVolume,
      netVolume: buyVolume - sellVolume,
    };
  }

  setInventory(inventory: number): void {
    this.currentInventory = Math.max(
      this.config.minInventory,
      Math.min(this.config.maxInventory, inventory)
    );
  }

  updateConfig(config: Partial<InventoryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): InventoryConfig {
    return { ...this.config };
  }

  reset(): void {
    this.currentInventory = this.config.targetInventory;
    this.tradeHistory = [];
    this.avgEntryPrice = 0;
  }
}

export function calculateOptimalInventoryTarget(
  baseReserve: number,
  quoteReserve: number,
  targetRatio: number = 0.5
): number {
  const totalValue = baseReserve + quoteReserve;
  return (targetRatio - 0.5) * totalValue;
}

export function calculateInventoryRisk(
  inventory: number,
  volatility: number,
  timeHorizon: number = 1
): number {
  return Math.abs(inventory) * volatility * Math.sqrt(timeHorizon);
}
