import { createServerFn } from "@tanstack/react-start"
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
import {
  fetchGraphQL,
  getAccountId,
  getMonthStart,
  getMonthEnd,
  getMonthStartDate,
  extractAccountData,
  type GraphQLResponse,
} from "./graphql"
import {
  calculateOverage,
  calculateStorageOverage,
  calculatePer100KCost,
  calculatePer1KCost,
  buildMetric,
  buildProductUsage,
  sumField,
  bytesToGB,
} from "./metrics"

export const $queryCloudflareGraphQL = createServerFn({ method: "POST" })
  .inputValidator(z.object({ query: z.string() }))
  .handler(async ({ data: { query } }): Promise<GraphQLResponse> => {
    return fetchGraphQL(query)
  })

export const $getAccountId = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return getAccountId()
  } catch {
    return null
  }
})

export const $fetchR2Usage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = getAccountId()
  const monthStart = getMonthStart()

  const [opsData, storageData] = await Promise.all([
    fetchGraphQL<{ viewer: { accounts: Array<{ r2OperationsAdaptiveGroups: R2OperationsGroup[] }> } }>(`{
      viewer {
        accounts(filter: { accountTag: "${accountId}" }) {
          r2OperationsAdaptiveGroups(filter: { datetime_geq: "${monthStart}" }, limit: 9999) {
            dimensions { actionType }
            sum { requests }
          }
        }
      }
    }`),
    fetchGraphQL<{ viewer: { accounts: Array<{ r2StorageAdaptiveGroups: R2StorageGroup[] }> } }>(`{
      viewer {
        accounts(filter: { accountTag: "${accountId}" }) {
          r2StorageAdaptiveGroups(filter: { datetime_geq: "${monthStart}" }, limit: 9999) {
            max { payloadSize, metadataSize, objectCount }
          }
        }
      }
    }`),
  ])

  const operations = extractAccountData(opsData)?.r2OperationsAdaptiveGroups ?? []
  const storage = extractAccountData(storageData)?.r2StorageAdaptiveGroups ?? []

  let classATotal = 0
  let classBTotal = 0
  operations.forEach((item) => {
    const action = item.dimensions.actionType
    if ((R2_CLASS_A_OPERATIONS as readonly string[]).includes(action)) {
      classATotal += item.sum.requests
    } else if ((R2_CLASS_B_OPERATIONS as readonly string[]).includes(action)) {
      classBTotal += item.sum.requests
    }
  })

  const storageGB = bytesToGB(storage[0]?.max.payloadSize ?? 0)

  const classAOverage = calculateOverage(classATotal, R2_LIMITS.classAOperations, R2_LIMITS.classAOveragePer1M)
  const classBOverage = calculateOverage(classBTotal, R2_LIMITS.classBOperations, R2_LIMITS.classBOveragePer1M)
  const storageOverage = calculateStorageOverage(storageGB, R2_LIMITS.storageGB, R2_LIMITS.storagePerGB)

  return buildProductUsage("R2 Storage", [
    buildMetric({ name: "Class A Operations", current: classATotal, limit: R2_LIMITS.classAOperations, unit: "requests", rate: "$4.50/1M requests" }, classAOverage),
    buildMetric({ name: "Class B Operations", current: classBTotal, limit: R2_LIMITS.classBOperations, unit: "requests", rate: "$0.36/1M requests" }, classBOverage),
    buildMetric({ name: "Storage", current: storageGB, limit: R2_LIMITS.storageGB, unit: "GB", rate: "$0.015/GB-month" }, storageOverage),
  ])
})

export const $fetchWorkersUsage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = getAccountId()
  const monthStart = getMonthStart()
  const monthEnd = getMonthEnd()

  const data = await fetchGraphQL<{ viewer: { accounts: Array<{ workersInvocationsAdaptive: Array<{ sum: { requests: number }, quantiles: { cpuTimeP50: number } }> }> } }>(`{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        workersInvocationsAdaptive(filter: { datetime_geq: "${monthStart}", datetime_leq: "${monthEnd}" }, limit: 9999) {
          sum { requests }
          quantiles { cpuTimeP50 }
        }
      }
    }
  }`)

  const invocations = extractAccountData(data)?.workersInvocationsAdaptive ?? []

  let totalRequests = 0
  let totalCpuUs = 0
  invocations.forEach((item) => {
    totalRequests += item.sum.requests
    totalCpuUs += item.quantiles.cpuTimeP50 * item.sum.requests
  })
  const totalCpuMs = totalCpuUs / 1000

  const requestsOverage = calculateOverage(totalRequests, WORKERS_PAID_LIMITS.requestsPerMonth, WORKERS_PAID_LIMITS.requestOveragePer1M)
  const cpuOverage = calculateOverage(totalCpuMs, WORKERS_PAID_LIMITS.cpuMsPerMonth, WORKERS_PAID_LIMITS.cpuOveragePer1M)

  return buildProductUsage("Workers", [
    buildMetric({ name: "Requests", current: totalRequests, limit: WORKERS_PAID_LIMITS.requestsPerMonth, unit: "requests", rate: "$0.30/1M requests" }, requestsOverage),
    buildMetric({ name: "CPU Time (est.)", current: totalCpuMs, limit: WORKERS_PAID_LIMITS.cpuMsPerMonth, unit: "ms", rate: "$0.02/1M ms" }, cpuOverage),
  ])
})

export const $fetchKVUsage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = getAccountId()
  const monthStart = getMonthStart()

  const [opsData, storageData] = await Promise.all([
    fetchGraphQL<{ viewer: { accounts: Array<{ kvOperationsAdaptiveGroups: KVOperationsGroup[] }> } }>(`{
      viewer {
        accounts(filter: { accountTag: "${accountId}" }) {
          kvOperationsAdaptiveGroups(filter: { datetime_geq: "${monthStart}" }, limit: 9999) {
            dimensions { actionType }
            sum { requests }
          }
        }
      }
    }`),
    fetchGraphQL<{ viewer: { accounts: Array<{ kvStorageAdaptiveGroups: KVStorageGroup[] }> } }>(`{
      viewer {
        accounts(filter: { accountTag: "${accountId}" }) {
          kvStorageAdaptiveGroups(filter: { datetime_geq: "${monthStart}" }, limit: 9999) {
            max { byteCount, keyCount }
          }
        }
      }
    }`),
  ])

  const operations = extractAccountData(opsData)?.kvOperationsAdaptiveGroups ?? []
  const storage = extractAccountData(storageData)?.kvStorageAdaptiveGroups ?? []

  let reads = 0, writes = 0, deletes = 0, lists = 0
  operations.forEach((item) => {
    const action = item.dimensions.actionType.toLowerCase()
    if (action.includes("read") || action.includes("get")) reads += item.sum.requests
    else if (action.includes("write") || action.includes("put")) writes += item.sum.requests
    else if (action.includes("delete")) deletes += item.sum.requests
    else if (action.includes("list")) lists += item.sum.requests
  })

  const storageGB = bytesToGB(storage[0]?.max.byteCount ?? 0)

  const readsOverage = calculateOverage(reads, KV_PAID_LIMITS.readsPerMonth, KV_PAID_LIMITS.readOveragePer1M)
  const writesOverage = calculateOverage(writes, KV_PAID_LIMITS.writesPerMonth, KV_PAID_LIMITS.writeOveragePer1M)
  const deletesOverage = calculateOverage(deletes, KV_PAID_LIMITS.deletesPerMonth, KV_PAID_LIMITS.deleteOveragePer1M)
  const listsOverage = calculateOverage(lists, KV_PAID_LIMITS.listsPerMonth, KV_PAID_LIMITS.listOveragePer1M)
  const storageOverage = calculateStorageOverage(storageGB, KV_PAID_LIMITS.storageGB, KV_PAID_LIMITS.storagePerGB)

  return buildProductUsage("Workers KV", [
    buildMetric({ name: "Reads", current: reads, limit: KV_PAID_LIMITS.readsPerMonth, unit: "requests", rate: "$0.50/1M reads" }, readsOverage),
    buildMetric({ name: "Writes", current: writes, limit: KV_PAID_LIMITS.writesPerMonth, unit: "requests", rate: "$5.00/1M writes" }, writesOverage),
    buildMetric({ name: "Deletes", current: deletes, limit: KV_PAID_LIMITS.deletesPerMonth, unit: "requests", rate: "$5.00/1M deletes" }, deletesOverage),
    buildMetric({ name: "Lists", current: lists, limit: KV_PAID_LIMITS.listsPerMonth, unit: "requests", rate: "$5.00/1M lists" }, listsOverage),
    buildMetric({ name: "Storage", current: storageGB, limit: KV_PAID_LIMITS.storageGB, unit: "GB", rate: "$0.50/GB-month" }, storageOverage),
  ])
})

export const $fetchD1Usage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = getAccountId()
  const monthStartDate = getMonthStartDate()

  const [analyticsData, storageData] = await Promise.all([
    fetchGraphQL<{ viewer: { accounts: Array<{ d1AnalyticsAdaptiveGroups: D1AnalyticsGroup[] }> } }>(`{
      viewer {
        accounts(filter: { accountTag: "${accountId}" }) {
          d1AnalyticsAdaptiveGroups(filter: { date_geq: "${monthStartDate}" }, limit: 9999) {
            dimensions { databaseId }
            sum { rowsRead, rowsWritten }
          }
        }
      }
    }`),
    fetchGraphQL<{ viewer: { accounts: Array<{ d1StorageAdaptiveGroups: D1StorageGroup[] }> } }>(`{
      viewer {
        accounts(filter: { accountTag: "${accountId}" }) {
          d1StorageAdaptiveGroups(filter: { date_geq: "${monthStartDate}" }, limit: 9999) {
            dimensions { databaseId }
            max { databaseSizeBytes }
          }
        }
      }
    }`),
  ])

  const analytics = extractAccountData(analyticsData)?.d1AnalyticsAdaptiveGroups ?? []
  const storage = extractAccountData(storageData)?.d1StorageAdaptiveGroups ?? []

  const totalRowsRead = sumField(analytics, (i) => i.sum.rowsRead)
  const totalRowsWritten = sumField(analytics, (i) => i.sum.rowsWritten)
  const storageGB = bytesToGB(sumField(storage, (i) => i.max.databaseSizeBytes))

  const rowsReadOverage = calculateOverage(totalRowsRead, D1_LIMITS.rowsReadPerMonth, D1_LIMITS.rowsReadOveragePer1M)
  const rowsWrittenOverage = calculateOverage(totalRowsWritten, D1_LIMITS.rowsWrittenPerMonth, D1_LIMITS.rowsWrittenOveragePer1M)
  const storageOverage = calculateStorageOverage(storageGB, D1_LIMITS.storageGB, D1_LIMITS.storageOveragePerGB)

  return buildProductUsage("D1 Database", [
    buildMetric({ name: "Rows Read", current: totalRowsRead, limit: D1_LIMITS.rowsReadPerMonth, unit: "rows", rate: "$0.001/1M rows" }, rowsReadOverage),
    buildMetric({ name: "Rows Written", current: totalRowsWritten, limit: D1_LIMITS.rowsWrittenPerMonth, unit: "rows", rate: "$1.00/1M rows" }, rowsWrittenOverage),
    buildMetric({ name: "Storage", current: storageGB, limit: D1_LIMITS.storageGB, unit: "GB", rate: "$0.75/GB-month" }, storageOverage),
  ])
})

export const $fetchImagesUsage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = getAccountId()
  const monthStart = getMonthStart()

  const data = await fetchGraphQL<{ viewer: { accounts: Array<{ imagesRequestsAdaptiveGroups: Array<{ sum: { requests: number } }> }> } }>(`{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        imagesRequestsAdaptiveGroups(filter: { datetime_geq: "${monthStart}" }, limit: 9999) {
          sum { requests }
        }
      }
    }
  }`)

  const images = extractAccountData(data)?.imagesRequestsAdaptiveGroups ?? []
  const totalRequests = sumField(images, (i) => i.sum.requests)
  const deliveredCost = calculatePer100KCost(totalRequests, IMAGES_LIMITS.deliveredPer100K)

  return buildProductUsage("Images", [
    buildMetric({ name: "Requests", current: totalRequests, limit: 0, unit: "requests", rate: "$1.00/100K requests" }, deliveredCost),
  ])
})

export const $fetchWorkersAIUsage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = getAccountId()
  const monthStart = getMonthStart()

  const data = await fetchGraphQL<{ viewer: { accounts: Array<{ aiInferenceAdaptiveGroups: Array<{ sum: { totalNeurons: number } }> }> } }>(`{
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        aiInferenceAdaptiveGroups(filter: { datetime_geq: "${monthStart}" }, limit: 9999) {
          sum { totalNeurons }
        }
      }
    }
  }`)

  const aiData = extractAccountData(data)?.aiInferenceAdaptiveGroups ?? []
  const totalNeurons = sumField(aiData, (i) => i.sum.totalNeurons)

  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const monthlyFreeNeurons = WORKERS_AI_LIMITS.neuronsPerDay * daysInMonth
  const neuronCost = calculatePer1KCost(totalNeurons, monthlyFreeNeurons, WORKERS_AI_LIMITS.neuronOveragePer1K)

  return buildProductUsage("Workers AI", [
    buildMetric({ name: "Neurons", current: totalNeurons, limit: monthlyFreeNeurons, unit: "neurons", rate: "$0.011/1K neurons" }, neuronCost),
  ])
})

export const $fetchVectorizeUsage = createServerFn({ method: "GET" }).handler(async (): Promise<ProductUsage | null> => {
  const accountId = getAccountId()
  const monthStart = getMonthStart()

  const [queriesData, storageData] = await Promise.all([
    fetchGraphQL<{ viewer: { accounts: Array<{ vectorizeV2QueriesAdaptiveGroups: Array<{ sum: { queriedVectorDimensions: number } }> }> } }>(`{
      viewer {
        accounts(filter: { accountTag: "${accountId}" }) {
          vectorizeV2QueriesAdaptiveGroups(filter: { datetime_geq: "${monthStart}" }, limit: 9999) {
            sum { queriedVectorDimensions }
          }
        }
      }
    }`),
    fetchGraphQL<{ viewer: { accounts: Array<{ vectorizeV2StorageAdaptiveGroups: Array<{ max: { storedVectorDimensions: number } }> }> } }>(`{
      viewer {
        accounts(filter: { accountTag: "${accountId}" }) {
          vectorizeV2StorageAdaptiveGroups(filter: { datetime_geq: "${monthStart}" }, limit: 9999) {
            max { storedVectorDimensions }
          }
        }
      }
    }`),
  ])

  const queries = extractAccountData(queriesData)?.vectorizeV2QueriesAdaptiveGroups ?? []
  const storage = extractAccountData(storageData)?.vectorizeV2StorageAdaptiveGroups ?? []

  const queriedDimensions = sumField(queries, (i) => i.sum.queriedVectorDimensions)
  const storedDimensions = sumField(storage, (i) => i.max.storedVectorDimensions)

  const queriedOverage = calculateOverage(queriedDimensions, VECTORIZE_LIMITS.queriedDimensionsPerMonth, VECTORIZE_LIMITS.queriedOveragePer1M)
  const storedOverage = calculateOverage(storedDimensions, VECTORIZE_LIMITS.storedDimensionsPerMonth, VECTORIZE_LIMITS.storedOveragePer1M)

  return buildProductUsage("Vectorize", [
    buildMetric({ name: "Queried Dimensions", current: queriedDimensions, limit: VECTORIZE_LIMITS.queriedDimensionsPerMonth, unit: "dimensions", rate: "$0.01/1M dimensions" }, queriedOverage),
    buildMetric({ name: "Stored Dimensions", current: storedDimensions, limit: VECTORIZE_LIMITS.storedDimensionsPerMonth, unit: "dimensions", rate: "$0.05/1M dim-month" }, storedOverage),
  ])
})

export const $fetchAllUsage = createServerFn({ method: "GET" }).handler(async (): Promise<CloudflareUsageData> => {
  getAccountId() // Validate account ID exists

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

  const overageCosts = [r2, workers, kv, d1, images, ai, vectorize]
    .reduce((sum, item) => sum + (item?.totalOverageCost ?? 0), 0)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  return {
    r2, workers, kv, d1, images, ai, vectorize,
    errors,
    totalEstimatedCost: WORKERS_PAID_LIMITS.baseCost + overageCosts,
    billingPeriod: {
      start: monthStart.toISOString(),
      end: monthEnd.toISOString(),
    },
  }
})
