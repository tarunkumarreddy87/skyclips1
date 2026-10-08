import { z } from 'zod';
import { threeSceneDataSchema } from './src/three-scene';
import { readFileSync, writeFileSync } from 'node:fs';
const path = '../../packages/timeline-schema/schema/timeline.v1.json';
const schema = JSON.parse(readFileSync(path, 'utf8'));
const scene = z.toJSONSchema(threeSceneDataSchema, { target: 'draft-7' });
delete scene.$schema;
// Draft-7 tuples need explicit arity; regexp flags are not represented in JSON Schema.
function boundTuples(value: any) {
 if (!value || typeof value !== 'object') return;
 if (value.type === 'array' && Array.isArray(value.items)) { value.minItems = value.items.length; value.maxItems = value.items.length; value.additionalItems = false; }
 for (const child of Object.values(value)) boundTuples(child);
}
boundTuples(scene);
schema.definitions.threeScene = scene;
for (const name of ['videoClip','brollClip']) {
 schema.definitions[name].properties.three_scene = { $ref: '#/definitions/threeScene' };
 schema.definitions[name].not = {required:['three_scene','motion_template']};
}
writeFileSync(path, JSON.stringify(schema,null,2)+'\n');
