import { APR_VALIDATION } from "../config/database.js";
import { isFiniteNumber } from "./numberUtils.js";

export function convertDailyCompoundedApyToApr(apy: number): number {
  if (apy <= 0) {
    return 0;
  }

  // APY = (1 + daily_rate)^DAYS_PER_YEAR - 1
  // Solve for daily_rate: daily_rate = (1 + APY)^(1/DAYS_PER_YEAR) - 1
  // APR = daily_rate * DAYS_PER_YEAR
  const dailyRate = Math.pow(1 + apy, 1 / APR_VALIDATION.DAYS_PER_YEAR) - 1;
  return dailyRate * APR_VALIDATION.DAYS_PER_YEAR;
}

export function validateApr(apr: number): boolean {
  return (
    isFiniteNumber(apr) &&
    apr >= APR_VALIDATION.MIN_APR &&
    apr <= APR_VALIDATION.MAX_APR
  );
}

export function validateApy(apy: number): boolean {
  return isFiniteNumber(apy);
}

export function normalizePercentage(
  value: number,
  isDecimal: boolean = false,
): number {
  return isDecimal ? value : value / 100;
}
