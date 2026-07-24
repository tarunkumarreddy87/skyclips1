import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isValidTimeline, formatValidationErrors } from "./validate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures");

const files = readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));
let failed = 0;

for (const file of files) {
  const data = JSON.parse(readFileSync(join(fixturesDir, file), "utf-8"));
  // v2 draft fixtures are validated separately against timeline.v2.json
  if (data?.version === "2" || file.includes("-v2-")) {
    console.log(`SKIP ${file} (v2 draft)`);
    continue;
  }
  if (!isValidTimeline(data)) {
    console.error(`FAIL ${file}: ${formatValidationErrors()}`);
    failed += 1;
  } else {
    console.log(`OK   ${file}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
