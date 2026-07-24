import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../schema/timeline.v1.json";

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

export const validateTimeline = ajv.compile(schema);

export function isValidTimeline(data: unknown): data is Record<string, unknown> {
  return validateTimeline(data) === true;
}

export function formatValidationErrors(): string {
  return ajv.errorsText(validateTimeline.errors);
}

export { schema };
