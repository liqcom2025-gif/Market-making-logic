import type {
  PoolState,
  LiquidityPosition,
  SwapResult,
  AddLiquidityResult,
  RemoveLiquidityResult,
} from './types';

const DEFAULT_POOL_FEE = 0.003;
const MINIMUM_LIQUIDITY = 1000;

export class LiquidityPool {
  private tokenAReserve: number = 0;
  private tokenBReserve: number = 0;
  private lpTokenSupply: number = 0;
  private fee: number;
  private lastUpdate: number = Date.now();

  constructor(fee: number = DEFAULT_POOL_FEE) {
    this.fee = fee;
  }

  initialize(tokenAAmount: number, tokenBAmount: number): AddLiquidityResult {
    if (this.lpTokenSupply > 0) {
      throw new Error('Pool already initialized');
    }

    if (tokenAAmount <= 0 || tokenBAmount <= 0) {
      throw new Error('Invalid initial liquidity amounts');
    }

    const initialLiquidity = Math.sqrt(tokenAAmount * tokenBAmount);

    if (initialLiquidity < MINIMUM_LIQUIDITY) {
      throw new Error('Initial liquidity too low');
    }

    this.tokenAReserve = tokenAAmount;
    this.tokenBReserve = tokenBAmount;
    this.lpTokenSupply = initialLiquidity - MINIMUM_LIQUIDITY;
    this.lastUpdate = Date.now();

    return {
      lpTokensReceived: this.lpTokenSupply,
      tokenADeposited: tokenAAmount,
      tokenBDeposited: tokenBAmount,
      shareOfPool: 1,
    };
  }

  getState(): PoolState {
    return {
      tokenAReserve: this.tokenAReserve,
      tokenBReserve: this.tokenBReserve,
      totalLiquidity: Math.sqrt(this.tokenAReserve * this.tokenBReserve),
      lpTokenSupply: this.lpTokenSupply,
      fee: this.fee,
      lastUpdate: this.lastUpdate,
    };
  }

  getPrice(): number {
    if (this.tokenAReserve === 0) return 0;
    return this.tokenBReserve / this.tokenAReserve;
  }

  getSpotPrice(tokenIn: 'A' | 'B'): number {
    if (tokenIn === 'A') {
      return this.tokenAReserve > 0 ? this.tokenBReserve / this.tokenAReserve : 0;
    }
    return this.tokenBReserve > 0 ? this.tokenAReserve / this.tokenBReserve : 0;
  }

  simulateSwap(amountIn: number, tokenIn: 'A' | 'B'): SwapResult {
    if (amountIn <= 0) {
      throw new Error('Invalid swap amount');
    }

    const feeAmount = amountIn * this.fee;
    const amountInAfterFee = amountIn - feeAmount;

    let amountOut: number;
    let newReserveIn: number;
    let newReserveOut: number;

    if (tokenIn === 'A') {
      newReserveIn = this.tokenAReserve + amountInAfterFee;
      const k = this.tokenAReserve * this.tokenBReserve;
      newReserveOut = k / newReserveIn;
      amountOut = this.tokenBReserve - newReserveOut;
    } else {
      newReserveIn = this.tokenBReserve + amountInAfterFee;
      const k = this.tokenAReserve * this.tokenBReserve;
      newReserveOut = k / newReserveIn;
      amountOut = this.tokenAReserve - newReserveOut;
    }

    const spotPriceBefore = this.getSpotPrice(tokenIn);
    const executionPrice = amountOut / amountIn;
    const priceImpact = Math.abs(executionPrice - spotPriceBefore) / spotPriceBefore;

    const newPrice = tokenIn === 'A' ? newReserveOut / newReserveIn : newReserveIn / newReserveOut;

    return {
      amountIn,
      amountOut,
      priceImpact,
      fee: feeAmount,
      newPrice,
    };
  }

  executeSwap(amountIn: number, tokenIn: 'A' | 'B', minAmountOut: number = 0): SwapResult {
    const result = this.simulateSwap(amountIn, tokenIn);

    if (result.amountOut < minAmountOut) {
      throw new Error(`Slippage exceeded: expected ${minAmountOut}, got ${result.amountOut}`);
    }

    const amountInAfterFee = amountIn - result.fee;

    if (tokenIn === 'A') {
      this.tokenAReserve += amountInAfterFee;
      this.tokenBReserve -= result.amountOut;
    } else {
      this.tokenBReserve += amountInAfterFee;
      this.tokenAReserve -= result.amountOut;
    }

    this.lastUpdate = Date.now();
    return result;
  }

  addLiquidity(tokenAAmount: number, tokenBAmount: number): AddLiquidityResult {
    if (this.lpTokenSupply === 0) {
      return this.initialize(tokenAAmount, tokenBAmount);
    }

    const currentRatio = this.tokenBReserve / this.tokenAReserve;
    const providedRatio = tokenBAmount / tokenAAmount;

    let actualTokenA: number;
    let actualTokenB: number;

    if (providedRatio > currentRatio) {
      actualTokenA = tokenAAmount;
      actualTokenB = tokenAAmount * currentRatio;
    } else {
      actualTokenB = tokenBAmount;
      actualTokenA = tokenBAmount / currentRatio;
    }

    const lpTokensMinted = Math.min(
      (actualTokenA * this.lpTokenSupply) / this.tokenAReserve,
      (actualTokenB * this.lpTokenSupply) / this.tokenBReserve
    );

    this.tokenAReserve += actualTokenA;
    this.tokenBReserve += actualTokenB;
    this.lpTokenSupply += lpTokensMinted;
    this.lastUpdate = Date.now();

    return {
      lpTokensReceived: lpTokensMinted,
      tokenADeposited: actualTokenA,
      tokenBDeposited: actualTokenB,
      shareOfPool: lpTokensMinted / this.lpTokenSupply,
    };
  }

  removeLiquidity(lpTokens: number): RemoveLiquidityResult {
    if (lpTokens <= 0 || lpTokens > this.lpTokenSupply) {
      throw new Error('Invalid LP token amount');
    }

    const shareRatio = lpTokens / this.lpTokenSupply;
    const tokenAAmount = this.tokenAReserve * shareRatio;
    const tokenBAmount = this.tokenBReserve * shareRatio;

    this.tokenAReserve -= tokenAAmount;
    this.tokenBReserve -= tokenBAmount;
    this.lpTokenSupply -= lpTokens;
    this.lastUpdate = Date.now();

    return {
      lpTokensBurned: lpTokens,
      tokenAReceived: tokenAAmount,
      tokenBReceived: tokenBAmount,
      fee: 0,
    };
  }

  getLiquidityPosition(lpTokens: number): LiquidityPosition {
    if (lpTokens <= 0 || this.lpTokenSupply === 0) {
      return {
        lpTokens: 0,
        shareOfPool: 0,
        tokenAAmount: 0,
        tokenBAmount: 0,
        entryPrice: 0,
        currentValue: 0,
        impermanentLoss: 0,
      };
    }

    const shareOfPool = lpTokens / this.lpTokenSupply;
    const tokenAAmount = this.tokenAReserve * shareOfPool;
    const tokenBAmount = this.tokenBReserve * shareOfPool;
    const currentPrice = this.getPrice();
    const currentValue = tokenAAmount * currentPrice + tokenBAmount;

    return {
      lpTokens,
      shareOfPool,
      tokenAAmount,
      tokenBAmount,
      entryPrice: currentPrice,
      currentValue,
      impermanentLoss: 0,
    };
  }

  calculateImpermanentLoss(entryPrice: number, currentPrice: number): number {
    const priceRatio = currentPrice / entryPrice;
    const sqrtRatio = Math.sqrt(priceRatio);
    const holdValue = (1 + priceRatio) / 2;
    const lpValue = sqrtRatio;
    return (lpValue / holdValue) - 1;
  }

  getAmountOut(amountIn: number, tokenIn: 'A' | 'B'): number {
    return this.simulateSwap(amountIn, tokenIn).amountOut;
  }

  getAmountIn(amountOut: number, tokenOut: 'A' | 'B'): number {
    if (amountOut <= 0) return 0;

    let reserveIn: number;
    let reserveOut: number;

    if (tokenOut === 'A') {
      reserveIn = this.tokenBReserve;
      reserveOut = this.tokenAReserve;
    } else {
      reserveIn = this.tokenAReserve;
      reserveOut = this.tokenBReserve;
    }

    if (amountOut >= reserveOut) {
      throw new Error('Insufficient liquidity');
    }

    const numerator = reserveIn * amountOut;
    const denominator = (reserveOut - amountOut) * (1 - this.fee);

    return numerator / denominator;
  }

  calculateOptimalSwapAmount(
    tokenAToAdd: number,
    tokenBToAdd: number
  ): { swapAmount: number; tokenToSwap: 'A' | 'B' } | null {
    const currentRatio = this.tokenBReserve / this.tokenAReserve;
    const providedRatio = tokenBToAdd / tokenAToAdd;

    if (Math.abs(providedRatio - currentRatio) < 0.001) {
      return null;
    }

    if (providedRatio > currentRatio) {
      const excessB = tokenBToAdd - tokenAToAdd * currentRatio;
      const swapAmount = excessB / (2 * (1 + currentRatio * (1 - this.fee)));
      return { swapAmount, tokenToSwap: 'B' };
    } else {
      const excessA = tokenAToAdd - tokenBToAdd / currentRatio;
      const swapAmount = excessA / (2 * (1 + (1 - this.fee) / currentRatio));
      return { swapAmount, tokenToSwap: 'A' };
    }
  }

  setFee(fee: number): void {
    if (fee < 0 || fee >= 1) {
      throw new Error('Fee must be between 0 and 1');
    }
    this.fee = fee;
  }

  reset(): void {
    this.tokenAReserve = 0;
    this.tokenBReserve = 0;
    this.lpTokenSupply = 0;
    this.lastUpdate = Date.now();
  }
}

export function calculateK(reserveA: number, reserveB: number): number {
  return reserveA * reserveB;
}

export function calculatePriceFromReserves(reserveA: number, reserveB: number): number {
  return reserveA > 0 ? reserveB / reserveA : 0;
}

export function estimateSlippage(
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
  fee: number = 0.003
): number {
  const amountInAfterFee = amountIn * (1 - fee);
  const amountOut = (reserveOut * amountInAfterFee) / (reserveIn + amountInAfterFee);
  const spotPrice = reserveOut / reserveIn;
  const executionPrice = amountOut / amountIn;
  return Math.abs(executionPrice - spotPrice) / spotPrice;
}
