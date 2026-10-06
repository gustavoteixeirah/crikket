import { describe, expect, it } from "bun:test"
import { gzipSync } from "node:zlib"
import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { decodeStoredDebuggerPayload } from "../src/lib/debugger-payload-encoding"

const minioEndpoint = process.env.MINIO_ENDPOINT
const minioAccessKeyId = process.env.MINIO_ACCESS_KEY_ID ?? "minioadmin"
const minioSecretAccessKey = process.env.MINIO_SECRET_ACCESS_KEY ?? "minioadmin"
const minioBucket = process.env.MINIO_BUCKET ?? "crikket-debugger-gzip"
const minioRegion = process.env.MINIO_REGION ?? "us-east-1"

const debuggerPayload = {
  actions: [],
  logs: [
    {
      level: "error",
      message: "minio gzip probe",
      timestamp: "2026-10-06T00:00:00.000Z",
      offset: 1,
    },
  ],
  networkRequests: [],
}

describe.skipIf(!minioEndpoint)("MinIO debugger gzip ingest", () => {
  it("decodes both Content-Encoding gzip objects and opaque gzip objects", async () => {
    const client = new S3Client({
      region: minioRegion,
      endpoint: minioEndpoint,
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: minioAccessKeyId,
        secretAccessKey: minioSecretAccessKey,
      },
    })

    try {
      await client.send(new CreateBucketCommand({ Bucket: minioBucket }))
    } catch {
      // Bucket may already exist for repeated local runs.
    }

    const jsonBuffer = Buffer.from(JSON.stringify(debuggerPayload), "utf8")
    const gzipBuffer = gzipSync(jsonBuffer)

    await client.send(
      new PutObjectCommand({
        Bucket: minioBucket,
        Key: "legacy-content-encoding.json.gz",
        Body: gzipBuffer,
        ContentType: "application/json",
        ContentEncoding: "gzip",
      })
    )
    await client.send(
      new PutObjectCommand({
        Bucket: minioBucket,
        Key: "opaque-gzip.json.gz",
        Body: gzipBuffer,
        ContentType: "application/gzip",
      })
    )

    const encodedObject = await readObject(
      client,
      "legacy-content-encoding.json.gz"
    )
    const opaqueObject = await readObject(client, "opaque-gzip.json.gz")

    expect(
      JSON.parse(
        decodeStoredDebuggerPayload(encodedObject, "gzip").toString("utf8")
      )
    ).toEqual(debuggerPayload)
    expect(
      JSON.parse(
        decodeStoredDebuggerPayload(opaqueObject, "gzip").toString("utf8")
      )
    ).toEqual(debuggerPayload)
  })
})

async function readObject(client: S3Client, key: string): Promise<Buffer> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: minioBucket,
      Key: key,
    })
  )

  if (!response.Body) {
    return Buffer.alloc(0)
  }

  const bytes = await response.Body.transformToByteArray()
  return Buffer.from(bytes)
}
