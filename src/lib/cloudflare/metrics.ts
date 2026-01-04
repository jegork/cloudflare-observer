import type { UsageMetric, ProductUsage } from "./types"
import { bytesToGB } from "@/lib/formatters"

export function calculateOverage(current: number, limit: number, costPer1M: number): number {
  const overage = Math.max(0, current - limit)
  return (overage / 1_000_000) * costPer1M
}

export function calculateStorageOverage(currentGB: number, limitGB: number, costPerGB: number): number {
  const overage = Math.max(0, currentGB - limitGB)
  return overage * costPerGB
}

export function calculatePer100KCost(current: number, costPer100K: number): number {
  return (current / 100_000) * costPer100K
}

export function calculatePer1KCost(current: number, limit: number, costPer1K: number): number {
  const overage = Math.max(0, current - limit)
  return (overage / 1000) * costPer1K
}

export interface MetricInput {
  name: string
  current: number
  limit: number
  unit: string
  rate: string
}

export function buildMetric(
  input: MetricInput,
  overageCost: number
): UsageMetric {
  const { name, current, limit, unit, rate } = input
  return {
    name,
    current,
    limit,
    unit,
    percentage: limit > 0 ? (current / limit) * 100 : 0,
    overageCost,
    rate,
  }
}

export function buildProductUsage(
  product: string,
  metrics: UsageMetric[]
): ProductUsage {
  const totalOverageCost = metrics.reduce((sum, m) => sum + m.overageCost, 0)
  return { product, metrics, totalOverageCost }
}

export function sumField<T>(items: T[], getter: (item: T) => number): number {
  return items.reduce((sum, item) => sum + (getter(item) ?? 0), 0)
}

export function maxField<T>(items: T[], getter: (item: T) => number): number {
  return items.reduce((max, item) => Math.max(max, getter(item) ?? 0), 0)
}

export { bytesToGB }
