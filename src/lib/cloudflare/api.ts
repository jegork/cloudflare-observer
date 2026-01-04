import { createServerFn } from "@tanstack/react-start"
import { env } from "cloudflare:workers"
import { z } from "zod"
import {
  type R2OperationsGroup,
  type R2StorageGroup,
  type KVOperationsGroup,
  type KVStorageGroup,
  type D1AnalyticsGroup,
  type D1StorageGroup,
  type CloudflareUsageData,
  type ProductUsage,
  R2_CLASS_A_OPERATIONS,
  R2_CLASS_B_OPERATIONS,
  R2_LIMITS,
  KV_PAID_LIMITS,
  WORKERS_PAID_LIMITS,
  D1_LIMITS,
  IMAGES_LIMITS,
  WORKERS_AI_LIMITS,
  VECTORIZE_LIMITS,
} from "./types"

const CLOUDFLARE_GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql"

interface GraphQLResponse<T = Record<string, object>> {
  data: T
  errors?: Array<{ message: string }>
}

function getMonthStart(): string {
  const date = new Date()
  date.setUTCDate(1)
  date.setUTCHours(0, 0, 0, 0)
  return date.toISOString()
}

function getMonthEnd(): string {
  const date = new Date()
  date.setUTCMonth(date.getUTCMonth() + 1)
  date.setUTCDate(0)
  date.setUTCHours(23, 59, 59, 999)
  return date.toISOString()
}

function calculateOverage(current: number, limit: number, costPer1M: number): number {
  const overage = Math.max(0, current - limit)
  return (overage / 1_000_000) * costPer1M
}

function calculateStorageOverage(currentGB: number, limitGB: number, costPerGB: number): number {
  const overage = Math.max(0, currentGB - limitGB)
  return overage * costPerGB
}

async function fetchGraphQL<T>(query: string): Promise<GraphQLResponse<T>> {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = env.CLOUDFLARE_API_TOKEN

  if (!accountId || !apiToken) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in .dev.vars")
  }

  const res = await fetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  })

  const responseText = await res.text()

  if (!res.ok) {
    console.error("Cloudflare API error:", res.status, responseText)
    throw new Error(`Cloudflare API error: ${res.status} - ${responseText.slice(0, 200)}`)
  }

  const data = JSON.parse(responseText) as GraphQLResponse<T>

  if (data.errors?.length) {
    console.error("GraphQL errors:", data.errors)
    throw new Error(`GraphQL error: ${data.errors[0].message}`)
  }

  return data
}

export const $queryCloudflareGraphQL = createServerFn({ method: "POST" })
  .inputValidator(z.object({ query: z.string() }))
  .handler(async ({ data: { query } }): Promise<GraphQLResponse> => {
    return fetchGraphQL(query)
  })

export const $getAccountId = createServerFn({ method: "GET" }).handler(async () => {
  return env.CLOUDFLARE_ACCOUNT_ID ?? null
})

export const $fetchR2Usage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID

  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID")
  }

  const monthStart = getMonthStart()

  const operationsQuery = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        r2OperationsAdaptiveGroups(
          filter: { datetime_geq: "${monthStart}" }
          limit: 9999
        ) {
          dimensions {
            actionType
          }
          sum {
            requests
          }
        }
      }
    }
  }`

  const storageQuery = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        r2StorageAdaptiveGroups(
          limit: 9999
          filter: { datetime_geq: "${monthStart}" }
        ) {
          max {
            payloadSize
            metadataSize
            objectCount
          }
        }
      }
    }
  }`

  const [opsData, storageData] = await Promise.all([
    fetchGraphQL<{ viewer: { accounts: Array<{ r2OperationsAdaptiveGroups: R2OperationsGroup[] }> } }>(operationsQuery),
    fetchGraphQL<{ viewer: { accounts: Array<{ r2StorageAdaptiveGroups: R2StorageGroup[] }> } }>(storageQuery),
  ])

  const operations = opsData.data.viewer.accounts[0]?.r2OperationsAdaptiveGroups ?? []
  const storage = storageData.data.viewer.accounts[0]?.r2StorageAdaptiveGroups ?? []

  let classATotal = 0
  let classBTotal = 0

  operations.forEach((item) => {
    if (R2_CLASS_A_OPERATIONS.includes(item.dimensions.actionType)) {
      classATotal += item.sum.requests
    } else if (R2_CLASS_B_OPERATIONS.includes(item.dimensions.actionType)) {
      classBTotal += item.sum.requests
    }
  })

  const storageBytes = storage[0]?.max.payloadSize ?? 0
  const storageGB = storageBytes / (1024 * 1024 * 1024)

  const classAOverage = calculateOverage(classATotal, R2_LIMITS.classAOperations, R2_LIMITS.classAOveragePer1M)
  const classBOverage = calculateOverage(classBTotal, R2_LIMITS.classBOperations, R2_LIMITS.classBOveragePer1M)
  const storageOverage = calculateStorageOverage(storageGB, R2_LIMITS.storageGB, R2_LIMITS.storagePerGB)

  return {
    product: "R2 Storage",
    metrics: [
      {
        name: "Class A Operations",
        current: classATotal,
        limit: R2_LIMITS.classAOperations,
        unit: "requests",
        percentage: (classATotal / R2_LIMITS.classAOperations) * 100,
        overageCost: classAOverage,
        rate: "$4.50/1M requests",
      },
      {
        name: "Class B Operations",
        current: classBTotal,
        limit: R2_LIMITS.classBOperations,
        unit: "requests",
        percentage: (classBTotal / R2_LIMITS.classBOperations) * 100,
        overageCost: classBOverage,
        rate: "$0.36/1M requests",
      },
      {
        name: "Storage",
        current: storageGB,
        limit: R2_LIMITS.storageGB,
        unit: "GB",
        percentage: (storageGB / R2_LIMITS.storageGB) * 100,
        overageCost: storageOverage,
        rate: "$0.015/GB-month",
      },
    ],
    totalOverageCost: classAOverage + classBOverage + storageOverage,
  }
})

export const $fetchWorkersUsage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID

  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID")
  }

  const monthStart = getMonthStart()
  const monthEnd = getMonthEnd()

  const query = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        workersInvocationsAdaptive(
          filter: {
            datetime_geq: "${monthStart}"
            datetime_leq: "${monthEnd}"
          }
          limit: 9999
        ) {
          dimensions {
            scriptName
          }
          sum {
            requests
          }
          quantiles {
            cpuTimeP50
          }
        }
      }
    }
  }`

  const data = await fetchGraphQL<{ viewer: { accounts: Array<{ workersInvocationsAdaptive: Array<{ dimensions: { scriptName: string }, sum: { requests: number }, quantiles: { cpuTimeP50: number } }> }> } }>(query)
  const invocations = data.data.viewer.accounts[0]?.workersInvocationsAdaptive ?? []

  let totalRequests = 0
  let totalCpuUs = 0

  invocations.forEach((item) => {
    totalRequests += item.sum.requests
    // cpuTimeP50 is median CPU time per request in microseconds
    totalCpuUs += item.quantiles.cpuTimeP50 * item.sum.requests
  })

  // Convert microseconds to milliseconds
  const totalCpuMs = totalCpuUs / 1000

  const requestsOverage = calculateOverage(totalRequests, WORKERS_PAID_LIMITS.requestsPerMonth, WORKERS_PAID_LIMITS.requestOveragePer1M)
  const cpuOverage = calculateOverage(totalCpuMs, WORKERS_PAID_LIMITS.cpuMsPerMonth, WORKERS_PAID_LIMITS.cpuOveragePer1M)

  return {
    product: "Workers",
    metrics: [
      {
        name: "Requests",
        current: totalRequests,
        limit: WORKERS_PAID_LIMITS.requestsPerMonth,
        unit: "requests",
        percentage: (totalRequests / WORKERS_PAID_LIMITS.requestsPerMonth) * 100,
        overageCost: requestsOverage,
        rate: "$0.30/1M requests",
      },
      {
        name: "CPU Time (est.)",
        current: totalCpuMs,
        limit: WORKERS_PAID_LIMITS.cpuMsPerMonth,
        unit: "ms",
        percentage: (totalCpuMs / WORKERS_PAID_LIMITS.cpuMsPerMonth) * 100,
        overageCost: cpuOverage,
        rate: "$0.02/1M ms",
      },
    ],
    totalOverageCost: requestsOverage + cpuOverage,
  }
})

export const $fetchKVUsage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID

  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID")
  }

  const monthStart = getMonthStart()

  const operationsQuery = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        kvOperationsAdaptiveGroups(
          filter: { datetime_geq: "${monthStart}" }
          limit: 9999
        ) {
          dimensions {
            actionType
          }
          sum {
            requests
          }
        }
      }
    }
  }`

  const storageQuery = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        kvStorageAdaptiveGroups(
          filter: { datetime_geq: "${monthStart}" }
          limit: 9999
        ) {
          max {
            byteCount
            keyCount
          }
        }
      }
    }
  }`

  const [opsData, storageData] = await Promise.all([
    fetchGraphQL<{ viewer: { accounts: Array<{ kvOperationsAdaptiveGroups: KVOperationsGroup[] }> } }>(operationsQuery),
    fetchGraphQL<{ viewer: { accounts: Array<{ kvStorageAdaptiveGroups: KVStorageGroup[] }> } }>(storageQuery),
  ])

  const operations = opsData.data.viewer.accounts[0]?.kvOperationsAdaptiveGroups ?? []
  const storage = storageData.data.viewer.accounts[0]?.kvStorageAdaptiveGroups ?? []

  let reads = 0
  let writes = 0
  let deletes = 0
  let lists = 0

  operations.forEach((item) => {
    const action = item.dimensions.actionType.toLowerCase()
    if (action.includes("read") || action.includes("get")) {
      reads += item.sum.requests
    } else if (action.includes("write") || action.includes("put")) {
      writes += item.sum.requests
    } else if (action.includes("delete")) {
      deletes += item.sum.requests
    } else if (action.includes("list")) {
      lists += item.sum.requests
    }
  })

  const storageBytes = storage[0]?.max.byteCount ?? 0
  const storageGB = storageBytes / (1024 * 1024 * 1024)

  const readsOverage = calculateOverage(reads, KV_PAID_LIMITS.readsPerMonth, KV_PAID_LIMITS.readOveragePer1M)
  const writesOverage = calculateOverage(writes, KV_PAID_LIMITS.writesPerMonth, KV_PAID_LIMITS.writeOveragePer1M)
  const deletesOverage = calculateOverage(deletes, KV_PAID_LIMITS.deletesPerMonth, KV_PAID_LIMITS.deleteOveragePer1M)
  const listsOverage = calculateOverage(lists, KV_PAID_LIMITS.listsPerMonth, KV_PAID_LIMITS.listOveragePer1M)
  const storageOverage = calculateStorageOverage(storageGB, KV_PAID_LIMITS.storageGB, KV_PAID_LIMITS.storagePerGB)

  return {
    product: "Workers KV",
    metrics: [
      {
        name: "Reads",
        current: reads,
        limit: KV_PAID_LIMITS.readsPerMonth,
        unit: "requests",
        percentage: (reads / KV_PAID_LIMITS.readsPerMonth) * 100,
        overageCost: readsOverage,
        rate: "$0.50/1M reads",
      },
      {
        name: "Writes",
        current: writes,
        limit: KV_PAID_LIMITS.writesPerMonth,
        unit: "requests",
        percentage: (writes / KV_PAID_LIMITS.writesPerMonth) * 100,
        overageCost: writesOverage,
        rate: "$5.00/1M writes",
      },
      {
        name: "Deletes",
        current: deletes,
        limit: KV_PAID_LIMITS.deletesPerMonth,
        unit: "requests",
        percentage: (deletes / KV_PAID_LIMITS.deletesPerMonth) * 100,
        overageCost: deletesOverage,
        rate: "$5.00/1M deletes",
      },
      {
        name: "Lists",
        current: lists,
        limit: KV_PAID_LIMITS.listsPerMonth,
        unit: "requests",
        percentage: (lists / KV_PAID_LIMITS.listsPerMonth) * 100,
        overageCost: listsOverage,
        rate: "$5.00/1M lists",
      },
      {
        name: "Storage",
        current: storageGB,
        limit: KV_PAID_LIMITS.storageGB,
        unit: "GB",
        percentage: (storageGB / KV_PAID_LIMITS.storageGB) * 100,
        overageCost: storageOverage,
        rate: "$0.50/GB-month",
      },
    ],
    totalOverageCost: readsOverage + writesOverage + deletesOverage + listsOverage + storageOverage,
  }
})

export const $fetchD1Usage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID

  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID")
  }

  const monthStart = getMonthStart()

  const monthStartDate = monthStart.split("T")[0] // D1 uses date format, not datetime

  const analyticsQuery = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        d1AnalyticsAdaptiveGroups(
          filter: { date_geq: "${monthStartDate}" }
          limit: 9999
        ) {
          dimensions {
            databaseId
          }
          sum {
            rowsRead
            rowsWritten
          }
        }
      }
    }
  }`

  const storageQuery = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        d1StorageAdaptiveGroups(
          filter: { date_geq: "${monthStartDate}" }
          limit: 9999
        ) {
          dimensions {
            databaseId
          }
          max {
            databaseSizeBytes
          }
        }
      }
    }
  }`

  const [analyticsData, storageData] = await Promise.all([
    fetchGraphQL<{ viewer: { accounts: Array<{ d1AnalyticsAdaptiveGroups: D1AnalyticsGroup[] }> } }>(analyticsQuery),
    fetchGraphQL<{ viewer: { accounts: Array<{ d1StorageAdaptiveGroups: D1StorageGroup[] }> } }>(storageQuery),
  ])

  const analytics = analyticsData.data.viewer.accounts[0]?.d1AnalyticsAdaptiveGroups ?? []
  const storage = storageData.data.viewer.accounts[0]?.d1StorageAdaptiveGroups ?? []

  let totalRowsRead = 0
  let totalRowsWritten = 0

  analytics.forEach((item) => {
    totalRowsRead += item.sum.rowsRead
    totalRowsWritten += item.sum.rowsWritten
  })

  let totalStorageBytes = 0
  storage.forEach((item) => {
    totalStorageBytes += item.max.databaseSizeBytes
  })
  const storageGB = totalStorageBytes / (1024 * 1024 * 1024)

  const rowsReadOverage = calculateOverage(totalRowsRead, D1_LIMITS.rowsReadPerMonth, D1_LIMITS.rowsReadOveragePer1M)
  const rowsWrittenOverage = calculateOverage(totalRowsWritten, D1_LIMITS.rowsWrittenPerMonth, D1_LIMITS.rowsWrittenOveragePer1M)
  const storageOverage = calculateStorageOverage(storageGB, D1_LIMITS.storageGB, D1_LIMITS.storageOveragePerGB)

  return {
    product: "D1 Database",
    metrics: [
      {
        name: "Rows Read",
        current: totalRowsRead,
        limit: D1_LIMITS.rowsReadPerMonth,
        unit: "rows",
        percentage: (totalRowsRead / D1_LIMITS.rowsReadPerMonth) * 100,
        overageCost: rowsReadOverage,
        rate: "$0.001/1M rows",
      },
      {
        name: "Rows Written",
        current: totalRowsWritten,
        limit: D1_LIMITS.rowsWrittenPerMonth,
        unit: "rows",
        percentage: (totalRowsWritten / D1_LIMITS.rowsWrittenPerMonth) * 100,
        overageCost: rowsWrittenOverage,
        rate: "$1.00/1M rows",
      },
      {
        name: "Storage",
        current: storageGB,
        limit: D1_LIMITS.storageGB,
        unit: "GB",
        percentage: (storageGB / D1_LIMITS.storageGB) * 100,
        overageCost: storageOverage,
        rate: "$0.75/GB-month",
      },
    ],
    totalOverageCost: rowsReadOverage + rowsWrittenOverage + storageOverage,
  }
})

export const $fetchImagesUsage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID

  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID")
  }

  const monthStart = getMonthStart()

  const query = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        imagesRequestsAdaptiveGroups(
          filter: { datetime_geq: "${monthStart}" }
          limit: 9999
        ) {
          sum {
            requests
          }
        }
      }
    }
  }`

  const data = await fetchGraphQL<{ viewer: { accounts: Array<{ imagesRequestsAdaptiveGroups: Array<{ sum: { requests: number } }> }> } }>(query)
  const images = data.data.viewer.accounts[0]?.imagesRequestsAdaptiveGroups ?? []

  let totalRequests = 0

  images.forEach((item) => {
    totalRequests += item.sum.requests ?? 0
  })

  // Images pricing: $1 per 100K delivered
  const deliveredCost = (totalRequests / 100_000) * IMAGES_LIMITS.deliveredPer100K

  return {
    product: "Images",
    metrics: [
      {
        name: "Requests",
        current: totalRequests,
        limit: 0, // No free tier
        unit: "requests",
        percentage: 0,
        overageCost: deliveredCost,
        rate: "$1.00/100K requests",
      },
    ],
    totalOverageCost: deliveredCost,
  }
})

export const $fetchWorkersAIUsage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID

  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID")
  }

  const monthStart = getMonthStart()

  const query = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        aiInferenceAdaptiveGroups(
          filter: { datetime_geq: "${monthStart}" }
          limit: 9999
        ) {
          sum {
            totalNeurons
          }
        }
      }
    }
  }`

  const data = await fetchGraphQL<{ viewer: { accounts: Array<{ aiInferenceAdaptiveGroups: Array<{ sum: { totalNeurons: number } }> }> } }>(query)
  const aiData = data.data.viewer.accounts[0]?.aiInferenceAdaptiveGroups ?? []

  let totalNeurons = 0

  aiData.forEach((item) => {
    totalNeurons += item.sum.totalNeurons ?? 0
  })

  // Calculate daily free tier (10K neurons/day * days in month)
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthlyFreeNeurons = WORKERS_AI_LIMITS.neuronsPerDay * daysInMonth

  const neuronOverage = Math.max(0, totalNeurons - monthlyFreeNeurons)
  const neuronCost = (neuronOverage / 1000) * WORKERS_AI_LIMITS.neuronOveragePer1K

  return {
    product: "Workers AI",
    metrics: [
      {
        name: "Neurons",
        current: totalNeurons,
        limit: monthlyFreeNeurons,
        unit: "neurons",
        percentage: (totalNeurons / monthlyFreeNeurons) * 100,
        overageCost: neuronCost,
        rate: "$0.011/1K neurons",
      },
    ],
    totalOverageCost: neuronCost,
  }
})

export const $fetchVectorizeUsage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID

  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID")
  }

  const monthStart = getMonthStart()

  const queriesQuery = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        vectorizeV2QueriesAdaptiveGroups(
          filter: { datetime_geq: "${monthStart}" }
          limit: 9999
        ) {
          sum {
            queriedVectorDimensions
          }
        }
      }
    }
  }`

  const storageQuery = `{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        vectorizeV2StorageAdaptiveGroups(
          filter: { datetime_geq: "${monthStart}" }
          limit: 9999
        ) {
          max {
            storedVectorDimensions
          }
        }
      }
    }
  }`

  const [queriesData, storageData] = await Promise.all([
    fetchGraphQL<{ viewer: { accounts: Array<{ vectorizeV2QueriesAdaptiveGroups: Array<{ sum: { queriedVectorDimensions: number } }> }> } }>(queriesQuery),
    fetchGraphQL<{ viewer: { accounts: Array<{ vectorizeV2StorageAdaptiveGroups: Array<{ max: { storedVectorDimensions: number } }> }> } }>(storageQuery),
  ])

  const queries = queriesData.data.viewer.accounts[0]?.vectorizeV2QueriesAdaptiveGroups ?? []
  const storage = storageData.data.viewer.accounts[0]?.vectorizeV2StorageAdaptiveGroups ?? []

  let queriedDimensions = 0
  let storedDimensions = 0

  queries.forEach((item) => {
    queriedDimensions += item.sum.queriedVectorDimensions ?? 0
  })

  storage.forEach((item) => {
    storedDimensions += item.max.storedVectorDimensions ?? 0
  })

  const queriedOverage = calculateOverage(queriedDimensions, VECTORIZE_LIMITS.queriedDimensionsPerMonth, VECTORIZE_LIMITS.queriedOveragePer1M)
  const storedOverage = calculateOverage(storedDimensions, VECTORIZE_LIMITS.storedDimensionsPerMonth, VECTORIZE_LIMITS.storedOveragePer1M)

  return {
    product: "Vectorize",
    metrics: [
      {
        name: "Queried Dimensions",
        current: queriedDimensions,
        limit: VECTORIZE_LIMITS.queriedDimensionsPerMonth,
        unit: "dimensions",
        percentage: (queriedDimensions / VECTORIZE_LIMITS.queriedDimensionsPerMonth) * 100,
        overageCost: queriedOverage,
        rate: "$0.01/1M dimensions",
      },
      {
        name: "Stored Dimensions",
        current: storedDimensions,
        limit: VECTORIZE_LIMITS.storedDimensionsPerMonth,
        unit: "dimensions",
        percentage: (storedDimensions / VECTORIZE_LIMITS.storedDimensionsPerMonth) * 100,
        overageCost: storedOverage,
        rate: "$0.05/1M dim-month",
      },
    ],
    totalOverageCost: queriedOverage + storedOverage,
  }
})

export const $fetchAllUsage = createServerFn({ method: "GET" }).handler(async (): Promise<CloudflareUsageData> => {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = env.CLOUDFLARE_API_TOKEN

  if (!accountId || !apiToken) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in .dev.vars")
  }

  const errors: Array<{ service: string; message: string }> = []

  const captureError = (service: string) => (e: Error) => {
    console.error(`${service} fetch failed:`, e)
    errors.push({ service, message: e.message })
    return null
  }

  const [r2, workers, kv, d1, images, ai, vectorize] = await Promise.all([
    $fetchR2Usage().catch(captureError("R2 Storage")),
    $fetchWorkersUsage().catch(captureError("Workers")),
    $fetchKVUsage().catch(captureError("Workers KV")),
    $fetchD1Usage().catch(captureError("D1 Database")),
    $fetchImagesUsage().catch(captureError("Images")),
    $fetchWorkersAIUsage().catch(captureError("Workers AI")),
    $fetchVectorizeUsage().catch(captureError("Vectorize")),
  ])

  const baseCost = WORKERS_PAID_LIMITS.baseCost
  const overageCosts =
    (r2?.totalOverageCost ?? 0) +
    (workers?.totalOverageCost ?? 0) +
    (kv?.totalOverageCost ?? 0) +
    (d1?.totalOverageCost ?? 0) +
    (images?.totalOverageCost ?? 0) +
    (ai?.totalOverageCost ?? 0) +
    (vectorize?.totalOverageCost ?? 0)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  return {
    r2,
    workers,
    kv,
    d1,
    images,
    ai,
    vectorize,
    errors,
    totalEstimatedCost: baseCost + overageCosts,
    billingPeriod: {
      start: monthStart.toISOString(),
      end: monthEnd.toISOString(),
    },
  }
})
