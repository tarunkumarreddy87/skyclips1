import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deployFunction,
  deploySite,
  getOrCreateBucket,
} from "@remotion/lambda";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REMOTION_ENTRY = path.resolve(__dirname, "../../../packages/remotion-renderer/src/index.ts");

export interface DeployResult {
  functionName: string;
  serveUrl: string;
  bucketName: string;
  siteName: string;
}

/** Deploy or refresh Remotion Lambda function + site bundle. */
export async function deployRemotionSite(): Promise<DeployResult> {
  logger.info({ region: config.AWS_REGION, site: config.REMOTION_SITE_NAME }, "Deploying Remotion Lambda");

  const { bucketName } = await getOrCreateBucket({ region: config.AWS_REGION as "us-east-1" });
  logger.info({ bucketName }, "Remotion S3 bucket ready");

  let functionName = config.REMOTION_FUNCTION_NAME;
  // Always deploy/update function so memory+timeout (encoded in the name) match config.
  // Passing an existing name still updates the same function when mem/timeout match;
  // a new mem/timeout combo creates a correctly named function (fixes stale "120sec").
  const deployed = await deployFunction({
    region: config.AWS_REGION as "us-east-1",
    timeoutInSeconds: config.REMOTION_FUNCTION_TIMEOUT_SEC,
    memorySizeInMb: config.REMOTION_FUNCTION_MEMORY_MB,
    diskSizeInMb: config.REMOTION_FUNCTION_DISK_MB,
    createCloudWatchLogGroup: true,
  });
  if (functionName && functionName !== deployed.functionName) {
    logger.info(
      { previous: functionName, next: deployed.functionName },
      "Remotion Lambda function name changed (memory/timeout encoded in name)",
    );
  }
  functionName = deployed.functionName;
  logger.info(
    {
      functionName,
      memoryMb: config.REMOTION_FUNCTION_MEMORY_MB,
      timeoutSec: config.REMOTION_FUNCTION_TIMEOUT_SEC,
    },
    "Deployed/updated Lambda function",
  );

  const { serveUrl, siteName } = await deploySite({
    bucketName,
    entryPoint: REMOTION_ENTRY,
    region: config.AWS_REGION as "us-east-1",
    siteName: config.REMOTION_SITE_NAME,
  });

  logger.info({ serveUrl, siteName, functionName, bucketName }, "Remotion site deployed");
  return { functionName, serveUrl, bucketName, siteName };
}

/** CLI entrypoint: tsx src/remotion/site-deploy.ts */
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}`) {
  deployRemotionSite()
    .then((r) => {
      console.log("\nAdd to .env:");
      console.log(`REMOTION_FUNCTION_NAME=${r.functionName}`);
      console.log(`REMOTION_SERVE_URL=${r.serveUrl}`);
      console.log(`REMOTION_BUCKET_NAME=${r.bucketName}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
