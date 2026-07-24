/**
 * Deploy Remotion Lambda function + site.
 *
 * Usage: pnpm lambda:deploy
 * Requires REMOTION_AWS_ACCESS_KEY_ID / REMOTION_AWS_SECRET_ACCESS_KEY
 * and IAM role remotion-lambda-role (see docs/IAM.md).
 */

import path from "node:path";
import {
  deployFunction,
  deploySite,
  getOrCreateBucket,
  getFunctions,
} from "@remotion/lambda";
import {
  FUNCTION_DISK_MB,
  FUNCTION_MEMORY_MB,
  FUNCTION_TIMEOUT_SEC,
  LAMBDA_REGION,
  SITE_NAME,
} from "./config";

const entryPoint = path.resolve(__dirname, "../index.ts");

async function main() {
  console.log(`Region: ${LAMBDA_REGION}`);
  console.log(`Entry: ${entryPoint}`);

  if (!process.env.REMOTION_AWS_ACCESS_KEY_ID || !process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
    throw new Error(
      "Set REMOTION_AWS_ACCESS_KEY_ID and REMOTION_AWS_SECRET_ACCESS_KEY (see docs/IAM.md). MinIO S3_* keys will not work.",
    );
  }

  const { bucketName } = await getOrCreateBucket({ region: LAMBDA_REGION });
  console.log(`S3 bucket: ${bucketName}`);

  const existing = await getFunctions({ region: LAMBDA_REGION, compatibleOnly: true });
  const deployed = await deployFunction({
    region: LAMBDA_REGION,
    timeoutInSeconds: FUNCTION_TIMEOUT_SEC,
    memorySizeInMb: FUNCTION_MEMORY_MB,
    diskSizeInMb: FUNCTION_DISK_MB,
    createCloudWatchLogGroup: true,
  });
  const functionName = deployed.functionName;
  if (existing.length > 0 && existing[0].functionName !== functionName) {
    console.log(`Note: new function ${functionName} (previous: ${existing[0].functionName})`);
  } else if (existing.length > 0) {
    console.log(`Updated function: ${functionName} (${FUNCTION_MEMORY_MB}MB, ${FUNCTION_TIMEOUT_SEC}s)`);
  } else {
    console.log(`Deployed function: ${functionName}`);
  }

  const { serveUrl, siteName } = await deploySite({
    bucketName,
    entryPoint,
    region: LAMBDA_REGION,
    siteName: SITE_NAME,
  });

  console.log(`Site name: ${siteName}`);
  console.log(`Serve URL: ${serveUrl}`);
  console.log("\nWrite these to .env (or secrets store):");
  console.log(`REMOTION_FUNCTION_NAME=${functionName}`);
  console.log(`REMOTION_SERVE_URL=${serveUrl}`);
  console.log(`REMOTION_BUCKET_NAME=${bucketName}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
