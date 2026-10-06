import { LINEAR_GRAPHQL_URL, LINEAR_REQUEST_TIMEOUT_MS } from "./constants"
import { isRetryableLinearHttpStatus } from "./policy"

export type LinearGraphqlFetch = typeof fetch

export class LinearApiError extends Error {
  readonly retryable: boolean
  readonly status: number | null

  constructor(input: {
    message: string
    retryable: boolean
    status?: number | null
  }) {
    super(input.message)
    this.name = "LinearApiError"
    this.retryable = input.retryable
    this.status = input.status ?? null
  }
}

export type LinearTeam = {
  id: string
  key: string
  labels: LinearLabel[]
  name: string
  projects: LinearProject[]
}

export type LinearProject = {
  id: string
  name: string
}

export type LinearLabel = {
  color: string | null
  id: string
  name: string
}

export type LinearCreatedIssue = {
  id: string
  identifier: string
  title: string
  url: string
}

export type LinearCreatedComment = {
  id: string
  url: string | null
}

type GraphqlResponse = {
  data?: Record<string, unknown>
  errors?: Array<{ message?: string }>
}

export async function linearGraphql<T>(input: {
  apiKey: string
  fetchImpl?: LinearGraphqlFetch
  query: string
  timeoutMs?: number
  variables?: Record<string, unknown>
}): Promise<T> {
  const fetchImpl = input.fetchImpl ?? fetch
  const response = await fetchImpl(LINEAR_GRAPHQL_URL, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(input.timeoutMs ?? LINEAR_REQUEST_TIMEOUT_MS),
    headers: {
      accept: "application/json",
      authorization: input.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      query: input.query,
      variables: input.variables ?? {},
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new LinearApiError({
      message: `Linear GraphQL returned HTTP ${response.status}.`,
      retryable: isRetryableLinearHttpStatus(response.status),
      status: response.status,
    })
  }

  let parsed: GraphqlResponse
  try {
    parsed = JSON.parse(raw) as GraphqlResponse
  } catch {
    throw new LinearApiError({
      message: "Linear GraphQL returned invalid JSON.",
      retryable: true,
      status: response.status,
    })
  }

  if (parsed.errors && parsed.errors.length > 0) {
    const message =
      parsed.errors
        .map((error) => error.message)
        .filter((value): value is string => Boolean(value))
        .join("; ") || "Linear GraphQL returned errors."
    throw new LinearApiError({
      message,
      retryable: false,
      status: response.status,
    })
  }

  if (!parsed.data) {
    throw new LinearApiError({
      message: "Linear GraphQL returned no data.",
      retryable: true,
      status: response.status,
    })
  }

  return parsed.data as T
}

const VIEWER_QUERY = `query CrikketLinearViewer {
  viewer {
    id
    name
  }
}`

const CATALOG_QUERY = `query CrikketLinearCatalog {
  teams {
    nodes {
      id
      key
      name
      labels {
        nodes {
          id
          name
          color
        }
      }
      projects {
        nodes {
          id
          name
        }
      }
    }
  }
}`

const CREATE_ISSUE_MUTATION = `mutation CrikketLinearIssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id
      identifier
      title
      url
    }
  }
}`

const CREATE_COMMENT_MUTATION = `mutation CrikketLinearCommentCreate($input: CommentCreateInput!) {
  commentCreate(input: $input) {
    success
    comment {
      id
      url
    }
  }
}`

export async function testLinearApiKey(input: {
  apiKey: string
  fetchImpl?: LinearGraphqlFetch
}): Promise<{ ok: true; viewerName: string | null }> {
  const data = await linearGraphql<{
    viewer?: { id?: string; name?: string | null }
  }>({
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    query: VIEWER_QUERY,
  })

  if (!data.viewer?.id) {
    throw new LinearApiError({
      message: "Linear API key is valid but returned no viewer.",
      retryable: false,
    })
  }

  return {
    ok: true,
    viewerName: data.viewer.name ?? null,
  }
}

function asIdName<T extends { id?: string; name?: string }>(
  node: T | undefined
): { id: string; name: string } | null {
  if (!node?.id) {
    return null
  }

  return {
    id: node.id,
    name: node.name ?? "Untitled",
  }
}

export async function listLinearCatalog(input: {
  apiKey: string
  fetchImpl?: LinearGraphqlFetch
}): Promise<LinearTeam[]> {
  const data = await linearGraphql<{
    teams?: {
      nodes?: Array<{
        id?: string
        key?: string
        labels?: {
          nodes?: Array<{
            color?: string | null
            id?: string
            name?: string
          }>
        }
        name?: string
        projects?: {
          nodes?: Array<{ id?: string; name?: string }>
        }
      }>
    }
  }>({
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    query: CATALOG_QUERY,
  })

  return (data.teams?.nodes ?? []).flatMap((team) => {
    if (!team.id) {
      return []
    }

    return [
      {
        id: team.id,
        key: team.key ?? "",
        name: team.name ?? "Untitled team",
        labels: (team.labels?.nodes ?? []).flatMap((label) => {
          const mapped = asIdName(label)
          return mapped ? [{ ...mapped, color: label.color ?? null }] : []
        }),
        projects: (team.projects?.nodes ?? []).flatMap((project) => {
          const mapped = asIdName(project)
          return mapped ? [mapped] : []
        }),
      },
    ]
  })
}

export async function createLinearIssue(input: {
  apiKey: string
  description: string
  fetchImpl?: LinearGraphqlFetch
  labelIds?: string[]
  projectId?: string | null
  teamId: string
  title: string
}): Promise<LinearCreatedIssue> {
  const data = await linearGraphql<{
    issueCreate?: {
      issue?: {
        id?: string
        identifier?: string
        title?: string
        url?: string
      }
      success?: boolean
    }
  }>({
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    query: CREATE_ISSUE_MUTATION,
    variables: {
      input: {
        description: input.description,
        labelIds:
          input.labelIds && input.labelIds.length > 0
            ? input.labelIds
            : undefined,
        projectId: input.projectId || undefined,
        teamId: input.teamId,
        title: input.title,
      },
    },
  })

  const issue = data.issueCreate?.issue
  if (
    !(data.issueCreate?.success && issue?.id && issue.identifier && issue.url)
  ) {
    throw new LinearApiError({
      message: "Linear did not return a created issue.",
      retryable: true,
    })
  }

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title ?? input.title,
    url: issue.url,
  }
}

export async function createLinearComment(input: {
  apiKey: string
  body: string
  fetchImpl?: LinearGraphqlFetch
  issueId: string
}): Promise<LinearCreatedComment> {
  const data = await linearGraphql<{
    commentCreate?: {
      comment?: { id?: string; url?: string | null }
      success?: boolean
    }
  }>({
    apiKey: input.apiKey,
    fetchImpl: input.fetchImpl,
    query: CREATE_COMMENT_MUTATION,
    variables: {
      input: {
        body: input.body,
        issueId: input.issueId,
      },
    },
  })

  const comment = data.commentCreate?.comment
  if (!(data.commentCreate?.success && comment?.id)) {
    throw new LinearApiError({
      message: "Linear did not return a created comment.",
      retryable: true,
    })
  }

  return {
    id: comment.id,
    url: comment.url ?? null,
  }
}
