export const API_V1_WWW_AUTHENTICATE = 'Bearer realm="crikket", charset="UTF-8"'

export class ApiClientError extends Error {
  readonly error: string
  readonly extraHeaders: Record<string, string>
  readonly status: number

  constructor(
    status: number,
    error: string,
    message: string,
    extraHeaders: Record<string, string> = {}
  ) {
    super(message)
    this.name = "ApiClientError"
    this.status = status
    this.error = error
    this.extraHeaders = extraHeaders
  }
}

export function jsonApiResponse(
  status: number,
  payload: unknown,
  extraHeaders?: Record<string, string>
): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
      ...extraHeaders,
    },
    status,
  })
}

export function jsonApiErrorResponse(error: ApiClientError): Response {
  return jsonApiResponse(
    error.status,
    { error: error.error, message: error.message },
    error.extraHeaders
  )
}

export function unauthorizedApiError(message: string): ApiClientError {
  return new ApiClientError(401, "unauthorized", message, {
    "www-authenticate": API_V1_WWW_AUTHENTICATE,
  })
}

export function forbiddenApiError(message: string): ApiClientError {
  return new ApiClientError(403, "forbidden", message)
}

export function notFoundApiError(message: string): ApiClientError {
  return new ApiClientError(404, "not_found", message)
}

export function badRequestApiError(
  error: string,
  message: string
): ApiClientError {
  return new ApiClientError(400, error, message)
}

export function methodNotAllowedApiError(message: string): ApiClientError {
  return new ApiClientError(405, "method_not_allowed", message, {
    allow: "GET, OPTIONS",
  })
}

export function rateLimitedApiError(
  message: string,
  headers: Record<string, string>
): ApiClientError {
  return new ApiClientError(429, "rate_limited", message, headers)
}
