# Market Maker Module (MM)

A comprehensive market-making system with spread calculation, inventory control, and liquidity pool interaction capabilities.

## Overview

This module provides the core infrastructure for automated market making, including:

- **Spread Calculation**: Dynamic bid/ask spread computation based on volatility and inventory
- **Inventory Control**: Position management with risk limits and rebalancing
- **Liquidity Pool**: AMM-style constant product liquidity pool implementation
- **Market Maker**: Unified interface combining all components

## Architecture

```
MM/
├── types.ts          # Type definitions
├── spread.ts         # Spread calculation logic
├── inventory.ts      # Inventory control system
├── liquidityPool.ts  # AMM liquidity pool
├── marketMaker.ts    # Main market maker class
├── index.ts          # Module exports
└── README.md         # Documentation
```

## Installation

The module is part of the main project. Import components as needed:

```typescript
import {
  MarketMaker,
  SpreadCalculator,
  InventoryController,
  LiquidityPool
} from './MM';
```

## Quick Start

### Basic Market Maker Setup

```typescript
import { MarketMaker } from './MM';

const mm = new MarketMaker({
  spread: {
    baseSpread: 0.002,      // 0.2% base spread
    minSpread: 0.0005,      // 0.05% minimum
    maxSpread: 0.02,        // 2% maximum
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
});

mm.start();

const marketData = {
  symbol: 'TOKEN/USDC',
  lastPrice: 1.5,
  bidPrice: 1.49,
  askPrice: 1.51,
  volume24h: 1000000,
  high24h: 1.6,
  low24h: 1.4,
  volatility: 0.05,
};

const quote = mm.generateQuotes(marketData);
console.log('Quote:', quote);

const { bidOrder, askOrder } = mm.placeOrders(quote);
```

## Components

### SpreadCalculator

Calculates optimal bid/ask spreads based on market conditions.

```typescript
import { SpreadCalculator } from './MM';

const calculator = new SpreadCalculator({
  baseSpread: 0.002,
  minSpread: 0.0005,
  maxSpread: 0.02,
  volatilityMultiplier: 2.0,
  inventorySkewMultiplier: 0.5,
});

const spreads = calculator.calculateOptimalSpread(marketData, inventoryState);
```

#### Spread Calculation Logic

1. **Base Spread**: Adjusted by trading volume (lower volume = wider spread)
2. **Volatility Adjustment**: Higher volatility increases spread
3. **Inventory Skew**: Long inventory widens bid, short inventory widens ask

### InventoryController

Manages position limits and tracks trading activity.

```typescript
import { InventoryController } from './MM';

const inventory = new InventoryController({
  targetInventory: 0,
  maxInventory: 1000,
  minInventory: -1000,
  rebalanceThreshold: 0.3,
  skewSensitivity: 1.5,
});

inventory.updateInventory(trade);

const state = inventory.getState();

if (inventory.needsRebalancing()) {
  const amount = inventory.getRebalanceAmount();
}
```

#### Inventory State

| Property | Description |
|----------|-------------|
| `currentInventory` | Current position size |
| `targetInventory` | Target position (usually 0) |
| `inventoryRatio` | Normalized position (0-1 scale) |
| `skewFactor` | Price adjustment factor (-1 to 1) |

### LiquidityPool

Constant product AMM implementation (x * y = k).

```typescript
import { LiquidityPool } from './MM';

const pool = new LiquidityPool(0.003); // 0.3% fee

const result = pool.initialize(10000, 15000);

const swapResult = pool.executeSwap(100, 'A', 145);

const addResult = pool.addLiquidity(1000, 1500);

const removeResult = pool.removeLiquidity(500);
```

#### Pool Operations

| Method | Description |
|--------|-------------|
| `initialize(tokenA, tokenB)` | Create new pool |
| `executeSwap(amount, token, minOut)` | Swap tokens |
| `addLiquidity(tokenA, tokenB)` | Add liquidity |
| `removeLiquidity(lpTokens)` | Remove liquidity |
| `simulateSwap(amount, token)` | Preview swap |
| `getPrice()` | Current spot price |

### MarketMaker

Unified interface combining all components.

```typescript
import { MarketMaker } from './MM';

const mm = new MarketMaker(config);

mm.start();

const quote = mm.generateQuotes(marketData);

const { bidOrder, askOrder } = mm.placeOrders(quote);

const trade = mm.processFill(orderId, filledSize, fillPrice);

const stats = mm.getStats();

mm.stop();
```

## Configuration

### SpreadConfig

```typescript
interface SpreadConfig {
  baseSpread: number;           // Base spread percentage (0.002 = 0.2%)
  minSpread: number;            // Minimum allowed spread
  maxSpread: number;            // Maximum allowed spread
  volatilityMultiplier: number; // Volatility impact factor
  inventorySkewMultiplier: number; // Inventory skew factor
}
```

### InventoryConfig

```typescript
interface InventoryConfig {
  targetInventory: number;    // Target position
  maxInventory: number;       // Maximum long position
  minInventory: number;       // Maximum short position (negative)
  rebalanceThreshold: number; // Trigger rebalance at this deviation
  skewSensitivity: number;    // Price skew sensitivity
}
```

### MarketMakerConfig

```typescript
interface MarketMakerConfig {
  spread: SpreadConfig;
  inventory: InventoryConfig;
  orderSize: number;      // Default order size
  maxOrderSize: number;   // Maximum order size
  minOrderSize: number;   // Minimum order size
  priceTickSize: number;  // Price rounding
  sizeTickSize: number;   // Size rounding
  updateIntervalMs: number; // Quote update interval
}
```

## Utility Functions

### Spread Utilities

```typescript
import {
  calculateEffectiveSpread,
  calculateMidPrice,
  calculateWeightedMidPrice,
  estimateVolatility
} from './MM';

const effectiveSpread = calculateEffectiveSpread(quote);

const mid = calculateMidPrice(bidPrice, askPrice);

const weightedMid = calculateWeightedMidPrice(bidPrice, bidSize, askPrice, askSize);

const volatility = estimateVolatility(priceHistory, 24);
```

### Inventory Utilities

```typescript
import {
  calculateOptimalInventoryTarget,
  calculateInventoryRisk
} from './MM';

const target = calculateOptimalInventoryTarget(baseReserve, quoteReserve, 0.5);

const risk = calculateInventoryRisk(inventory, volatility, timeHorizon);
```

### Pool Utilities

```typescript
import {
  calculateK,
  calculatePriceFromReserves,
  estimateSlippage
} from './MM';

const k = calculateK(reserveA, reserveB);

const price = calculatePriceFromReserves(reserveA, reserveB);

const slippage = estimateSlippage(amountIn, reserveIn, reserveOut, fee);
```

## Statistics & Monitoring

```typescript
const stats = mm.getStats();
```

| Metric | Description |
|--------|-------------|
| `totalTrades` | Number of executed trades |
| `totalVolume` | Total traded volume in quote |
| `realizedPnL` | Closed position P&L |
| `unrealizedPnL` | Open position P&L |
| `avgSpread` | Average captured spread |
| `inventoryTurnover` | Total inventory traded |
| `uptime` | Running time in ms |

## Risk Management

### Inventory Limits

The system enforces hard limits on inventory:

- Positions exceeding `maxInventory` are capped
- Positions below `minInventory` are floored
- Orders that would breach limits are rejected or resized

### Automatic Rebalancing

When inventory deviates beyond `rebalanceThreshold`:

```typescript
if (mm.needsRebalancing()) {
  const trade = mm.executeRebalance(marketData);
}
```

### Spread Skewing

Inventory imbalance automatically skews quotes:

- **Long position**: Wider bid spread, tighter ask spread (encourages selling)
- **Short position**: Tighter bid spread, wider ask spread (encourages buying)

## Example: Full Trading Loop

```typescript
import { MarketMaker, MarketData } from './MM';

const mm = new MarketMaker();
mm.start();

mm.initializeLiquidityPool(10000, 15000);

async function tradingLoop(marketData: MarketData) {
  const quote = mm.generateQuotes(marketData);

  const { bidOrder, askOrder } = mm.placeOrders(quote);

  if (mm.needsRebalancing()) {
    mm.executeRebalance(marketData);
  }

  const stats = mm.getStats();
  console.log(`PnL: ${stats.realizedPnL}, Volume: ${stats.totalVolume}`);
}
```

## Best Practices

1. **Start Conservative**: Begin with wider spreads and lower inventory limits
2. **Monitor Inventory**: Watch for inventory buildup indicating adverse selection
3. **Adjust for Volatility**: Increase spreads during high volatility periods
4. **Regular Rebalancing**: Don't let inventory deviate too far from target
5. **Track P&L**: Monitor both realized and unrealized P&L continuously

## License

Part of the Liqcom Protocol.
