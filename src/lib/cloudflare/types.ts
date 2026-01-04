// R2 operation types derived from arrays (single source of truth)
export const R2_CLASS_A_OPERATIONS = [
  "ListBuckets",
  "PutBucket",
  "ListObjects",
  "PutObject",
  "CopyObject",
  "CompleteMultipartUpload",
  "CreateMultipartUpload",
  "ListMultipartUploads",
  "UploadPart",
  "UploadPartCopy",
  "ListParts",
  "PutBucketEncryption",
  "PutBucketCors",
  "PutBucketLifecycleConfiguration",
] as const

export const R2_CLASS_B_OPERATIONS = [
  "HeadBucket",
  "HeadObject",
  "GetObject",
  "UsageSummary",
  "GetBucketEncryption",
  "GetBucketLocation",
  "GetBucketCors",
  "GetBucketLifecycleConfiguration",
  "DeleteObject",
  "DeleteBucket",
  "AbortMultipartUpload",
] as const

export type R2ActionType =
  | (typeof R2_CLASS_A_OPERATIONS)[number]
  | (typeof R2_CLASS_B_OPERATIONS)[number]

export interface R2OperationsGroup {
  dimensions: {
    actionType: R2ActionType
  }
  sum: {
    requests: number
  }
}

export interface R2StorageGroup {
  max: {
    payloadSize: number
    metadataSize: number
    objectCount: number
  }
}

export interface KVOperationsGroup {
  dimensions: {
    actionType: string
  }
  sum: {
    requests: number
  }
}

export interface KVStorageGroup {
  max: {
    byteCount: number
    keyCount: number
  }
}

export interface D1AnalyticsGroup {
  sum: {
    readQueries: number
    writeQueries: number
    rowsRead: number
    rowsWritten: number
  }
  max: {
    databaseSizeBytes: number
  }
  dimensions: {
    databaseId: string
  }
}

export interface UsageMetric {
  name: string
  current: number
  limit: number
  unit: string
  percentage: number
  overageCost: number
  rate?: string // e.g. "$0.50/1M requests"
}

export interface ProductUsage {
  product: string
  metrics: UsageMetric[]
  totalOverageCost: number
}

export interface ServiceError {
  service: string
  message: string
}

export interface CloudflareUsageData {
  r2: ProductUsage | null
  workers: ProductUsage | null
  kv: ProductUsage | null
  d1: ProductUsage | null
  images: ProductUsage | null
  ai: ProductUsage | null
  vectorize: ProductUsage | null
  errors: ServiceError[]
  totalEstimatedCost: number
  billingPeriod: {
    start: string
    end: string
  }
}

export interface D1StorageGroup {
  max: {
    databaseSizeBytes: number
  }
  dimensions: {
    databaseId: string
  }
}

// Workers Paid: $5/mo base
export const WORKERS_PAID_LIMITS = {
  requestsPerMonth: 10_000_000,
  cpuMsPerMonth: 30_000_000,
  requestOveragePer1M: 0.3,
  cpuOveragePer1M: 0.02,
  baseCost: 5,
} as const

// R2: Free tier included, pay for overage
export const R2_LIMITS = {
  storageGB: 10,
  classAOperations: 1_000_000,
  classBOperations: 10_000_000,
  storagePerGB: 0.015,
  classAOveragePer1M: 4.5,
  classBOveragePer1M: 0.36,
} as const

// KV: Included with Workers Paid
export const KV_PAID_LIMITS = {
  storageGB: 1,
  readsPerMonth: 10_000_000,
  writesPerMonth: 1_000_000,
  deletesPerMonth: 1_000_000,
  listsPerMonth: 1_000_000,
  storagePerGB: 0.5,
  readOveragePer1M: 0.5,
  writeOveragePer1M: 5,
  deleteOveragePer1M: 5,
  listOveragePer1M: 5,
} as const

// D1 Pricing
export const D1_LIMITS = {
  rowsReadPerMonth: 25_000_000_000,
  rowsWrittenPerMonth: 50_000_000,
  storageGB: 5,
  rowsReadOveragePer1M: 0.001,
  rowsWrittenOveragePer1M: 1,
  storageOveragePerGB: 0.75,
} as const

// Images Pricing
export const IMAGES_LIMITS = {
  transformationsPerMonth: 0, // No free tier, pay from start
  storedImages: 0,
  deliveredImages: 0,
  transformationsPer1K: 0.5,
  storedPer100K: 1,
  deliveredPer100K: 1,
} as const

// Workers AI Pricing
export const WORKERS_AI_LIMITS = {
  neuronsPerDay: 10_000, // Free tier
  neuronOveragePer1K: 0.011,
} as const

// Vectorize Pricing
export const VECTORIZE_LIMITS = {
  queriedDimensionsPerMonth: 30_000_000, // Free tier
  storedDimensionsPerMonth: 5_000_000, // Free tier
  queriedOveragePer1M: 0.01,
  storedOveragePer1M: 0.05,
} as const
