import { env } from "cloudflare:workers"

const CLOUDFLARE_GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql"

export interface GraphQLResponse<T = Record<string, object>> {
  data: T
  errors?: Array<{ message: string }>
}

export function getAccountId(): string {
  const accountId = env.CLOUDFLARE_ACCOUNT_ID
  if (!accountId) {
    throw new Error("Missing CLOUDFLARE_ACCOUNT_ID")
  }
  return accountId
}

export function getMonthStart(): string {
  const date = new Date()
  date.setUTCDate(1)
  date.setUTCHours(0, 0, 0, 0)
  return date.toISOString()
}

export function getMonthEnd(): string {
  const date = new Date()
  date.setUTCMonth(date.getUTCMonth() + 1)
  date.setUTCDate(0)
  date.setUTCHours(23, 59, 59, 999)
  return date.toISOString()
}

export function getMonthStartDate(): string {
  return getMonthStart().split("T")[0]
}

export async function fetchGraphQL<T>(query: string): Promise<GraphQLResponse<T>> {
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

export function extractAccountData<T>(data: GraphQLResponse<{ viewer: { accounts: T[] } }>): T | undefined {
  return data.data.viewer.accounts[0]
}
