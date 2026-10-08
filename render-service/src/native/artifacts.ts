import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

export async function presignArtifact(key: string): Promise<string> {
  const endpoint = config.S3_PUBLIC_ENDPOINT || config.S3_ENDPOINT || undefined;
  const client = new S3Client({
    region: config.S3_REGION,
    endpoint,
    forcePathStyle: Boolean(endpoint),
    credentials: config.S3_ACCESS_KEY && config.S3_SECRET_KEY ? {
      accessKeyId: config.S3_ACCESS_KEY, secretAccessKey: config.S3_SECRET_KEY,
    } : undefined,
  });
  return getSignedUrl(client, new GetObjectCommand({ Bucket: config.S3_BUCKET_NAME, Key: key }), { expiresIn: 7200 });
}
