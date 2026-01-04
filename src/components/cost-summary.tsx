import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import type { CloudflareUsageData } from "@/lib/cloudflare/types"
import { WORKERS_PAID_LIMITS } from "@/lib/cloudflare/types"

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount)
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

interface CostSummaryProps {
  data: CloudflareUsageData
}

export function CostSummary({ data }: CostSummaryProps) {
  const baseCost = WORKERS_PAID_LIMITS.baseCost
  const r2Overage = data.r2?.totalOverageCost ?? 0
  const workersOverage = data.workers?.totalOverageCost ?? 0
  const kvOverage = data.kv?.totalOverageCost ?? 0
  const totalOverage = r2Overage + workersOverage + kvOverage

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Estimated Bill</CardTitle>
        <CardDescription>
          {formatDate(data.billingPeriod.start)} - {formatDate(data.billingPeriod.end)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Workers Paid Plan</span>
            <span className="font-mono">{formatCurrency(baseCost)}</span>
          </div>

          {r2Overage > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">R2 Overage</span>
              <span className="font-mono text-red-500">+{formatCurrency(r2Overage)}</span>
            </div>
          )}

          {workersOverage > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Workers Overage</span>
              <span className="font-mono text-red-500">+{formatCurrency(workersOverage)}</span>
            </div>
          )}

          {kvOverage > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">KV Overage</span>
              <span className="font-mono text-red-500">+{formatCurrency(kvOverage)}</span>
            </div>
          )}

          <div className="border-t pt-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Total Estimated</span>
              <span className="text-xl font-bold font-mono">
                {formatCurrency(data.totalEstimatedCost)}
              </span>
            </div>
            {totalOverage > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Includes {formatCurrency(totalOverage)} in overage charges
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function CostSummarySkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="h-5 w-32 animate-pulse rounded bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
          <div className="border-t pt-3">
            <div className="flex justify-between">
              <div className="h-5 w-28 animate-pulse rounded bg-muted" />
              <div className="h-6 w-20 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
