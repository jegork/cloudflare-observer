import { createFileRoute } from "@tanstack/react-router"
import { useQuery, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useServerFn } from "@tanstack/react-start"
import { $fetchAllUsage } from "@/lib/cloudflare/api"
import { UsageCard, UsageCardSkeleton } from "@/components/usage-card"
import { CostSummary, CostSummarySkeleton } from "@/components/cost-summary"
import type { CloudflareUsageData } from "@/lib/cloudflare/types"

const queryClient = new QueryClient()

export const Route = createFileRoute("/")({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  ),
})

function Dashboard() {
  const fetchAllUsage = useServerFn($fetchAllUsage)

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["cloudflare-usage"],
    queryFn: () => fetchAllUsage(),
    refetchInterval: 60000, // Refetch every minute
    retry: 1,
  })

  if (isLoading) {
    return <DashboardSkeleton />
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-bold mb-6">Cloudflare Usage Dashboard</h1>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            <h2 className="font-medium">Failed to load usage data</h2>
            <p className="mt-1 text-sm">{error.message}</p>
            <p className="mt-2 text-sm">
              Make sure you have set the following in <code className="font-mono">.dev.vars</code>:
            </p>
            <ul className="mt-1 list-inside list-disc text-sm font-mono">
              <li>CLOUDFLARE_ACCOUNT_ID</li>
              <li>CLOUDFLARE_API_TOKEN</li>
              <li>CLOUDFLARE_EMAIL</li>
            </ul>
            <button
              onClick={() => refetch()}
              className="mt-4 rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!data) {
    return <DashboardSkeleton />
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cloudflare Usage Dashboard</h1>
            <p className="text-muted-foreground">
              Monitor your Cloudflare usage and estimated costs
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => refetch()}
              className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Refresh
            </button>
            <div className="text-right text-sm text-muted-foreground">
              <p>Last updated</p>
              <p className="font-mono">{new Date().toLocaleTimeString()}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-6">
          <div className="md:col-span-2">
            <CostSummary data={data} />
          </div>
          <QuickStats data={data} />
        </div>

        {data.errors.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
            <h3 className="font-medium text-amber-800 dark:text-amber-200">
              Failed to load some services
            </h3>
            <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-300">
              {data.errors.map((err, i) => (
                <li key={i} className="font-mono">
                  <span className="font-semibold">{err.service}:</span>{" "}
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {data.workers && <UsageCard usage={data.workers} />}
          {data.r2 && <UsageCard usage={data.r2} />}
          {data.kv && <UsageCard usage={data.kv} />}
          {data.d1 && <UsageCard usage={data.d1} />}
          {data.images && <UsageCard usage={data.images} />}
          {data.ai && <UsageCard usage={data.ai} />}
          {data.vectorize && <UsageCard usage={data.vectorize} />}
        </div>

        {!data.workers && !data.r2 && !data.kv && !data.d1 && !data.images && !data.ai && !data.vectorize && data.errors.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No usage data available for this billing period.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function QuickStats({ data }: { data: CloudflareUsageData }) {
  const allMetrics = [
    ...(data.workers?.metrics ?? []),
    ...(data.r2?.metrics ?? []),
    ...(data.kv?.metrics ?? []),
    ...(data.d1?.metrics ?? []),
    ...(data.images?.metrics ?? []),
    ...(data.ai?.metrics ?? []),
    ...(data.vectorize?.metrics ?? []),
  ]

  const atRisk = allMetrics.filter((m) => m.percentage >= 80 && m.percentage < 100)
  const overLimit = allMetrics.filter((m) => m.percentage >= 100)

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="text-sm text-muted-foreground">Metrics Over Limit</div>
        <div className={`text-3xl font-bold ${overLimit.length > 0 ? "text-red-500" : ""}`}>
          {overLimit.length}
        </div>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <div className="text-sm text-muted-foreground">At Risk (80%+)</div>
        <div className={`text-3xl font-bold ${atRisk.length > 0 ? "text-amber-500" : ""}`}>
          {atRisk.length}
        </div>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <div className="h-8 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-48 animate-pulse rounded bg-muted" />
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-6">
          <div className="md:col-span-2">
            <CostSummarySkeleton />
          </div>
          <div className="space-y-4">
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
            <div className="h-24 animate-pulse rounded-lg bg-muted" />
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <UsageCardSkeleton />
          <UsageCardSkeleton />
          <UsageCardSkeleton />
        </div>
      </div>
    </div>
  )
}
