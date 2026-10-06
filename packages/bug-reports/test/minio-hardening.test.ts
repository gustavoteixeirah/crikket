import { describe, expect, it } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"
import {
  buildOpaqueGzipDebuggerPayload,
  isOutsideBucketDenied,
  looksLikeGzip,
  requiredEnv,
  SMOKE_DEBUGGER_PAYLOAD,
} from "../../../scripts/storage-smoke"

const repoRoot = join(import.meta.dir, "../../..")

type IamPolicy = {
  Version: string
  Statement: Array<{
    Sid: string
    Effect: string
    Action: string[]
    Resource: string[]
  }>
}

type BucketCorsRule = {
  AllowedOrigins: string[]
  AllowedMethods: string[]
  AllowedHeaders: string[]
  ExposeHeaders: string[]
  MaxAgeSeconds: number
}

describe("MinIO crikket IAM policy fixture", () => {
  const policy = JSON.parse(
    readFileSync(join(repoRoot, "deploy/minio/crikket-policy.json"), "utf8")
  ) as IamPolicy

  it("is restricted to the crikket bucket ARNs", () => {
    const resources = policy.Statement.flatMap(
      (statement) => statement.Resource
    )
    expect(new Set(resources)).toEqual(
      new Set(["arn:aws:s3:::crikket", "arn:aws:s3:::crikket/*"])
    )
    for (const resource of resources) {
      expect(
        resource === "arn:aws:s3:::crikket" ||
          resource === "arn:aws:s3:::crikket/*"
      ).toBeTrue()
    }
  })

  it("allows only the S3 actions the app storage module uses", () => {
    const actions = new Set(
      policy.Statement.flatMap((statement) => statement.Action)
    )
    expect(actions).toEqual(
      new Set(["s3:PutObject", "s3:GetObject", "s3:DeleteObject"])
    )
    expect(actions.has("s3:ListBucket")).toBeFalse()
    expect(actions.has("s3:*")).toBeFalse()
    expect(
      policy.Statement.every((statement) => statement.Effect === "Allow")
    ).toBeTrue()
  })

  it("justifies each action with a Sid that matches the code path", () => {
    const sids = policy.Statement.map((statement) => statement.Sid)
    expect(sids).toEqual([
      "PutObjectDirectUploadsAndServerSave",
      "GetObjectPresignReadAndHead",
      "DeleteObjectArtifactCleanup",
    ])
  })

  it("scopes every statement to both the bucket and object ARNs", () => {
    for (const statement of policy.Statement) {
      expect(statement.Resource).toEqual([
        "arn:aws:s3:::crikket",
        "arn:aws:s3:::crikket/*",
      ])
    }
  })
})

describe("MinIO CORS fixture", () => {
  const cors = JSON.parse(
    readFileSync(join(repoRoot, "deploy/minio/cors.json"), "utf8")
  ) as BucketCorsRule[]
  const xml = readFileSync(join(repoRoot, "deploy/minio/cors.xml"), "utf8")

  it("lists explicit production and extension origins, methods, headers, ETag, and MaxAge", () => {
    expect(cors).toHaveLength(1)
    const rule = cors[0]!
    expect(rule.AllowedOrigins).toContain("https://crikket.kodegt.com")
    expect(
      rule.AllowedOrigins.some((origin) =>
        origin.startsWith("chrome-extension://")
      )
    ).toBeTrue()
    expect(rule.AllowedOrigins).not.toContain("*")
    expect(new Set(rule.AllowedMethods)).toEqual(
      new Set(["GET", "HEAD", "PUT"])
    )
    expect(rule.AllowedHeaders).toContain("Content-Type")
    expect(rule.AllowedHeaders).toContain("Content-Encoding")
    expect(rule.AllowedHeaders).toContain("x-amz-*")
    expect(rule.ExposeHeaders).toEqual(["ETag"])
    expect(rule.MaxAgeSeconds).toBe(3600)
  })

  it("keeps the MinIO XML equivalent in sync with cors.json", () => {
    expect(xml).toContain("https://crikket.kodegt.com")
    expect(xml).toContain("chrome-extension://PASTE_CHROME_EXTENSION_ID")
    expect(xml).toContain("<AllowedMethod>GET</AllowedMethod>")
    expect(xml).toContain("<AllowedMethod>HEAD</AllowedMethod>")
    expect(xml).toContain("<AllowedMethod>PUT</AllowedMethod>")
    expect(xml).toContain("<AllowedHeader>Content-Type</AllowedHeader>")
    expect(xml).toContain("<AllowedHeader>Content-Encoding</AllowedHeader>")
    expect(xml).toContain("<AllowedHeader>x-amz-*</AllowedHeader>")
    expect(xml).toContain("<ExposeHeader>ETag</ExposeHeader>")
    expect(xml).toContain("<MaxAgeSeconds>3600</MaxAgeSeconds>")
  })
})

describe("storage smoke helpers", () => {
  it("builds an opaque gzip debugger payload without needing MinIO", () => {
    const gzipBody = buildOpaqueGzipDebuggerPayload()
    expect(looksLikeGzip(gzipBody)).toBeTrue()
    expect(JSON.parse(gunzipSync(gzipBody).toString("utf8"))).toEqual(
      SMOKE_DEBUGGER_PAYLOAD
    )
  })

  it("treats AccessDenied-shaped errors as outside-bucket denials", () => {
    expect(
      isOutsideBucketDenied(
        Object.assign(new Error("Access Denied"), { name: "AccessDenied" })
      )
    ).toBeTrue()
    expect(
      isOutsideBucketDenied(
        Object.assign(new Error("PutObject"), {
          $metadata: { httpStatusCode: 403 },
        })
      )
    ).toBeTrue()
    expect(isOutsideBucketDenied(new Error("NoSuchBucket"))).toBeFalse()
  })

  it("requires named env vars", () => {
    const previous = process.env.STORAGE_SMOKE_HELPER_TEST
    process.env.STORAGE_SMOKE_HELPER_TEST = ""
    expect(() => requiredEnv("STORAGE_SMOKE_HELPER_TEST")).toThrow(
      "Missing required env STORAGE_SMOKE_HELPER_TEST"
    )
    if (previous === undefined) {
      process.env.STORAGE_SMOKE_HELPER_TEST = ""
    } else {
      process.env.STORAGE_SMOKE_HELPER_TEST = previous
    }
  })
})
