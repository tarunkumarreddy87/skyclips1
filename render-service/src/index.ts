import Fastify from "fastify";
import { registerRoutes } from "./api/routes.js";
import { applyRemotionEnv, config } from "./config.js";
import { logger } from "./utils/logger.js";

applyRemotionEnv();

const app = Fastify({
  logger: false,
  bodyLimit: 50 * 1024 * 1024, // 50 MB — long timelines with embedded metadata
});

await registerRoutes(app);

app.setErrorHandler((err: Error, _request, reply) => {
  logger.error({ err }, "Unhandled request error");
  reply.code(500).send({
    detail: err.message || "Internal server error",
    code: "INTERNAL_ERROR",
  });
});

try {
  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info(
    {
      port: config.PORT,
      region: config.AWS_REGION,
      serveUrl: config.REMOTION_SERVE_URL?.slice(0, 60) ?? "(not configured)",
      artifactsBucket: config.S3_BUCKET_NAME,
      maxConcurrent: config.RENDER_MAX_CONCURRENT,
      lambdaReady: Boolean(
        config.AWS_ACCESS_KEY_ID && config.AWS_SECRET_ACCESS_KEY && config.REMOTION_SERVE_URL,
      ),
    },
    "Render service started (Remotion Lambda only)",
  );
} catch (err) {
  logger.fatal({ err }, "Failed to start render service");
  process.exit(1);
}
