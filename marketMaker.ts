import type {
  MarketMakerConfig,
  MarketData,
  Quote,
  Trade,
  Order,
  MMStats,
  Position,
} from './types';
import { SpreadCalculator } from './spread';
import { InventoryController } from './inventory';
import { LiquidityPool } from './liquidityPool';

const DEFAULT_CONFIG: MarketMakerConfig = {
  spread: {
    baseSpread: 0.002,
    minSpread: 0.0005,
    maxSpread: 0.02,
    volatilityMultiplier: 2.0,
    inventorySkewMultiplier: 0.5,
  },
  inventory: {
    targetInventory: 0,
    maxInventory: 1000,
    minInventory: -1000,
    rebalanceThreshold: 0.3,
    skewSensitivity: 1.5,
  },
  orderSize: 100,
  maxOrderSize: 500,
  minOrderSize: 10,
  priceTickSize: 0.0001,
  sizeTickSize: 0.01,
  updateIntervalMs: 1000,
};

export class MarketMaker {
  private config: MarketMakerConfig;
  private spreadCalculator: SpreadCalculator;
  private inventoryController: InventoryController;
  private liquidityPool: LiquidityPool;
  private activeOrders: Map<string, Order> = new Map();
  private tradeHistory: Trade[] = [];
  private isRunning: boolean = false;
  private startTime: number = 0;
  private totalVolume: number = 0;
  private realizedPnL: number = 0;

  constructor(config: Partial<MarketMakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.spreadCalculator = new SpreadCalculator(this.config.spread);
    this.inventoryController = new InventoryController(this.config.inventory);
    this.liquidityPool = new LiquidityPool();
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startTime = Date.now();
  }

  stop(): void {
    this.isRunning = false;
    this.cancelAllOrders();
  }

  generateQuotes(marketData: MarketData): Quote {
    const inventoryState = this.inventoryController.getState();
    const midPrice = (marketData.bidPrice + marketData.askPrice) / 2;

    return this.spreadCalculator.generateQuote(
      midPrice,
      marketData,
      inventoryState,
      this.config.orderSize
    );
  }

  placeOrders(quote: Quote): { bidOrder: Order; askOrder: Order } {
    const bidOrder = this.createOrder('buy', quote.bidPrice, quote.bidSize);
    const askOrder = this.createOrder('sell', quote.askPrice, quote.askSize);

    this.activeOrders.set(bidOrder.id, bidOrder);
    this.activeOrders.set(askOrder.id, askOrder);

    return { bidOrder, askOrder };
  }

  private createOrder(side: 'buy' | 'sell', price: number, size: number): Order {
    const adjustedSize = Math.max(
      this.config.minOrderSize,
      Math.min(this.config.maxOrderSize, size)
    );

    if (!this.inventoryController.shouldAcceptOrder(side, adjustedSize)) {
      const maxSize = this.inventoryController.getMaxOrderSize(side);
      return this.createOrderObject(side, price, Math.min(adjustedSize, maxSize));
    }

    return this.createOrderObject(side, price, adjustedSize);
  }

  private createOrderObject(side: 'buy' | 'sell', price: number, size: number): Order {
    return {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      side,
      price: this.roundToTick(price, this.config.priceTickSize),
      size: this.roundToTick(size, this.config.sizeTickSize),
      filledSize: 0,
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  processFill(orderId: string, filledSize: number, fillPrice: number): Trade | null {
    const order = this.activeOrders.get(orderId);
    if (!order) return null;

    order.filledSize += filledSize;
    order.updatedAt = Date.now();

    if (order.filledSize >= order.size) {
      order.status = 'filled';
      this.activeOrders.delete(orderId);
    } else {
      order.status = 'partial';
    }

    const trade: Trade = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      side: order.side,
      price: fillPrice,
      size: filledSize,
      timestamp: Date.now(),
      fee: filledSize * fillPrice * 0.001,
    };

    this.inventoryController.updateInventory(trade);
    this.tradeHistory.push(trade);
    this.totalVolume += filledSize * fillPrice;
    this.updateRealizedPnL(trade);

    return trade;
  }

  private updateRealizedPnL(trade: Trade): void {
    const position = this.inventoryController.calculatePosition(trade.price);

    if (
      (trade.side === 'sell' && position.baseBalance >= 0) ||
      (trade.side === 'buy' && position.baseBalance <= 0)
    ) {
      const pnl = trade.side === 'sell'
        ? (trade.price - this.getAvgEntryPrice()) * trade.size
        : (this.getAvgEntryPrice() - trade.price) * trade.size;

      this.realizedPnL += pnl - trade.fee;
    }
  }

  private getAvgEntryPrice(): number {
    if (this.tradeHistory.length === 0) return 0;

    let totalCost = 0;
    let totalSize = 0;

    for (const trade of this.tradeHistory) {
      if (trade.side === 'buy') {
        totalCost += trade.price * trade.size;
        totalSize += trade.size;
      }
    }

    return totalSize > 0 ? totalCost / totalSize : 0;
  }

  cancelOrder(orderId: string): boolean {
    const order = this.activeOrders.get(orderId);
    if (!order) return false;

    order.status = 'cancelled';
    order.updatedAt = Date.now();
    this.activeOrders.delete(orderId);
    return true;
  }

  cancelAllOrders(): void {
    for (const [orderId] of this.activeOrders) {
      this.cancelOrder(orderId);
    }
  }

  getStats(): MMStats {
    const position = this.inventoryController.calculatePosition(
      this.tradeHistory.length > 0
        ? this.tradeHistory[this.tradeHistory.length - 1].price
        : 0
    );

    const tradeStats = this.inventoryController.getTradeStats();
    const uptime = this.isRunning ? Date.now() - this.startTime : 0;

    let avgSpread = 0;
    if (this.tradeHistory.length >= 2) {
      const recentTrades = this.tradeHistory.slice(-100);
      const buyPrices = recentTrades.filter(t => t.side === 'buy').map(t => t.price);
      const sellPrices = recentTrades.filter(t => t.side === 'sell').map(t => t.price);

      if (buyPrices.length > 0 && sellPrices.length > 0) {
        const avgBuy = buyPrices.reduce((a, b) => a + b, 0) / buyPrices.length;
        const avgSell = sellPrices.reduce((a, b) => a + b, 0) / sellPrices.length;
        avgSpread = (avgSell - avgBuy) / ((avgSell + avgBuy) / 2);
      }
    }

    return {
      totalTrades: tradeStats.count,
      totalVolume: this.totalVolume,
      realizedPnL: this.realizedPnL,
      unrealizedPnL: position.unrealizedPnL,
      avgSpread,
      inventoryTurnover: tradeStats.buyVolume + tradeStats.sellVolume,
      uptime,
    };
  }

  getPosition(): Position {
    const lastPrice = this.tradeHistory.length > 0
      ? this.tradeHistory[this.tradeHistory.length - 1].price
      : 0;
    return this.inventoryController.calculatePosition(lastPrice);
  }

  getActiveOrders(): Order[] {
    return Array.from(this.activeOrders.values());
  }

  getInventoryState() {
    return this.inventoryController.getState();
  }

  needsRebalancing(): boolean {
    return this.inventoryController.needsRebalancing();
  }

  executeRebalance(marketData: MarketData): Trade | null {
    if (!this.needsRebalancing()) return null;

    const rebalanceAmount = this.inventoryController.getRebalanceAmount();
    const side = rebalanceAmount > 0 ? 'buy' : 'sell';
    const size = Math.abs(rebalanceAmount);
    const price = side === 'buy' ? marketData.askPrice : marketData.bidPrice;

    const order = this.createOrder(side, price, size);
    return this.processFill(order.id, size, price);
  }

  initializeLiquidityPool(tokenA: number, tokenB: number) {
    return this.liquidityPool.initialize(tokenA, tokenB);
  }

  addLiquidity(tokenA: number, tokenB: number) {
    return this.liquidityPool.addLiquidity(tokenA, tokenB);
  }

  removeLiquidity(lpTokens: number) {
    return this.liquidityPool.removeLiquidity(lpTokens);
  }

  executeSwap(amountIn: number, tokenIn: 'A' | 'B', minAmountOut: number = 0) {
    return this.liquidityPool.executeSwap(amountIn, tokenIn, minAmountOut);
  }

  getPoolState() {
    return this.liquidityPool.getState();
  }

  private roundToTick(value: number, tickSize: number): number {
    return Math.round(value / tickSize) * tickSize;
  }

  updateConfig(config: Partial<MarketMakerConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.spread) {
      this.spreadCalculator.updateConfig(config.spread);
    }
    if (config.inventory) {
      this.inventoryController.updateConfig(config.inventory);
    }
  }

  getConfig(): MarketMakerConfig {
    return { ...this.config };
  }

  isActive(): boolean {
    return this.isRunning;
  }

  reset(): void {
    this.stop();
    this.activeOrders.clear();
    this.tradeHistory = [];
    this.totalVolume = 0;
    this.realizedPnL = 0;
    this.startTime = 0;
    this.inventoryController.reset();
    this.liquidityPool.reset();
  }
}
