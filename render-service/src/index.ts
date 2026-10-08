import Fastify from "fastify";
import { registerRoutes } from "./api/routes.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";
import { renderWorkerPool } from "./jobs/render-worker.js";


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
  app.addHook("onClose", async () => { await renderWorkerPool.stopRecovery(); });
  await app.listen({ port: config.PORT, host: config.HOST });
  renderWorkerPool.startRecovery();
  let closing = false;
  const shutdown = () => {
    if (closing) return;
    closing = true;
    void app.close().then(() => process.exit(0), err => {
      logger.error({ err }, "Render service shutdown failed");
      process.exit(1);
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
  logger.info(
    {
      port: config.PORT,
      engine: "hanuman-native-v1",
      encoder: config.RENDER_ENCODER,
      artifactsBucket: config.S3_BUCKET_NAME,
      maxConcurrent: config.RENDER_MAX_CONCURRENT,
    },
    "Render service started (native workers)",
  );
  if (config.NODE_ENV === "production" && !config.RENDER_SERVICE_API_KEY) {
    logger.warn(
      "RENDER_SERVICE_API_KEY is not set: render endpoints accept unauthenticated requests. " +
        "Keep this service on a private network or configure a key.",
    );
  }
} catch (err) {
  logger.fatal({ err }, "Failed to start render service");
  process.exit(1);
}
