import {
  CopyObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

let _artifactsClient: S3Client | null = null;
let _remotionClient: S3Client | null = null;

function artifactsS3(): S3Client {
  if (!_artifactsClient) {
    const accessKey = config.S3_ACCESS_KEY || config.AWS_ACCESS_KEY_ID;
    const secretKey = config.S3_SECRET_KEY || config.AWS_SECRET_ACCESS_KEY;
    if (!accessKey || !secretKey) {
      throw new Error("S3 credentials required (S3_ACCESS_KEY/S3_SECRET_KEY or AWS_*)");
    }
    _artifactsClient = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(config.S3_ENDPOINT),
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });
  }
  return _artifactsClient;
}

function remotionS3(): S3Client {
  if (!_remotionClient) {
    if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY) {
      throw new Error("AWS credentials required for Remotion S3 operations");
    }
    _remotionClient = new S3Client({
      region: config.AWS_REGION,
      credentials: {
        accessKeyId: config.AWS_ACCESS_KEY_ID,
        secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return _remotionClient;
}

/** Parse s3://bucket/key or https URL from Remotion outputFile. */
export function parseS3Location(url: string): { bucket: string; key: string } | null {
  if (url.startsWith("s3://")) {
    const without = url.slice("s3://".length);
    const slash = without.indexOf("/");
    if (slash === -1) return null;
    return { bucket: without.slice(0, slash), key: without.slice(slash + 1) };
  }
  try {
    const parsed = new URL(url);
    const hostParts = parsed.hostname.split(".");
    // bucket.s3.region.amazonaws.com/key
    if (hostParts.length >= 4 && hostParts[1] === "s3") {
      const bucket = hostParts[0];
      const key = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
      return { bucket, key };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Copy rendered MP4 from Remotion Lambda output to the artifacts bucket.
 * Falls back to HTTP download when cross-bucket S3 copy is unavailable (MinIO target).
 */
export async function copyRenderOutput(params: {
  outputUrl: string;
  destKey: string;
  remotionBucket?: string;
}): Promise<{ bytes: number; artifactUrl: string | null }> {
  const { outputUrl, destKey, remotionBucket } = params;
  const destBucket = config.S3_BUCKET_NAME;
  const s3Loc = parseS3Location(outputUrl);

  // Same AWS account: server-side copy from Remotion bucket → artifacts bucket.
  if (s3Loc && !config.S3_ENDPOINT) {
    try {
      await remotionS3().send(
        new CopyObjectCommand({
          Bucket: destBucket,
          Key: destKey,
          CopySource: `${s3Loc.bucket}/${s3Loc.key}`,
        }),
      );
      const url = await presignArtifact(destKey);
      logger.info({ destKey, source: s3Loc, method: "s3-copy" }, "Copied render output");
      const head = await remotionS3().send(
        new GetObjectCommand({ Bucket: s3Loc.bucket, Key: s3Loc.key }),
      );
      return { bytes: head.ContentLength ?? 0, artifactUrl: url };
    } catch (err) {
      logger.warn({ err, destKey }, "S3 copy failed; falling back to HTTP download");
    }
  }

  // MinIO / cross-cloud: download from presigned Remotion URL and upload.
  logger.info({ outputUrl: outputUrl.slice(0, 80), destKey }, "Downloading Lambda output via HTTP");
  const res = await fetch(outputUrl);
  if (!res.ok) {
    throw new Error(`Failed to download Lambda output: HTTP ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) {
    throw new Error("Lambda output file too small — render may have failed");
  }

  await artifactsS3().send(
    new PutObjectCommand({
      Bucket: destBucket,
      Key: destKey,
      Body: buf,
      ContentType: "video/mp4",
    }),
  );

  const url = await presignArtifact(destKey);
  logger.info(
    { destKey, bytes: buf.length, remotionBucket, method: "http-upload" },
    "Uploaded render output to artifacts bucket",
  );
  return { bytes: buf.length, artifactUrl: url };
}

export async function presignArtifact(key: string, expiresIn = 7200): Promise<string | null> {
  try {
    return await getSignedUrl(
      artifactsS3(),
      new GetObjectCommand({ Bucket: config.S3_BUCKET_NAME, Key: key }),
      { expiresIn },
    );
  } catch (err) {
    logger.warn({ err, key }, "Could not presign artifact URL");
    return null;
  }
}
