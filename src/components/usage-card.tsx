import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import type { ProductUsage, UsageMetric } from "@/lib/cloudflare/types"

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(2)}B`
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(2)}K`
  }
  return num.toFixed(2)
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function getProgressColor(percentage: number): string {
  if (percentage >= 100) return "bg-red-500"
  if (percentage >= 80) return "bg-amber-500"
  if (percentage >= 50) return "bg-yellow-500"
  return "bg-emerald-500"
}

function MetricRow({ metric }: { metric: UsageMetric }) {
  const percentage = Math.min(metric.percentage, 100)
  const isOverLimit = metric.percentage > 100
  const hasLimit = metric.limit > 0

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex flex-col">
          <span className="text-muted-foreground">{metric.name}</span>
          {metric.rate && (
            <span className="text-xs text-muted-foreground/70 font-mono">{metric.rate}</span>
          )}
        </div>
        <span className="font-mono text-right">
          {hasLimit ? (
            <>
              {formatNumber(metric.current)} / {formatNumber(metric.limit)} {metric.unit}
            </>
          ) : (
            <>
              {formatNumber(metric.current)} {metric.unit}
            </>
          )}
        </span>
      </div>
      {hasLimit && (
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full transition-all ${getProgressColor(metric.percentage)}`}
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      <div className="flex items-center justify-between text-xs">
        {hasLimit ? (
          <span className={isOverLimit ? "text-red-500 font-medium" : "text-muted-foreground"}>
            {metric.percentage.toFixed(1)}% used
          </span>
        ) : (
          <span className="text-muted-foreground">Pay per use</span>
        )}
        {metric.overageCost > 0 && (
          <span className="text-red-500 font-medium">
            +{formatCurrency(metric.overageCost)}
          </span>
        )}
      </div>
    </div>
  )
}

interface UsageCardProps {
  usage: ProductUsage
}

export function UsageCard({ usage }: UsageCardProps) {
  const hasOverage = usage.totalOverageCost > 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{usage.product}</CardTitle>
          {hasOverage && (
            <span className="text-sm font-medium text-red-500">
              +{formatCurrency(usage.totalOverageCost)}
            </span>
          )}
        </div>
        <CardDescription>
          {usage.metrics.length} metrics tracked
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {usage.metrics.map((metric) => (
          <MetricRow key={metric.name} metric={metric} />
        ))}
      </CardContent>
    </Card>
  )
}

export function UsageCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
