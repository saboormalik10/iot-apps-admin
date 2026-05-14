/**
 * Pre-generates the OpenAPI spec as a static JSON file during `npm run build`.
 * Run via: node dist/scripts/generateSwagger.js  (after tsc)
 *
 * The output dist/swagger-spec.json is copied into the production Docker image
 * so the app never needs to glob-scan files at runtime on Alpine Linux.
 */
import fs from 'fs';
import path from 'path';
import swaggerJsdoc from 'swagger-jsdoc';
import { swaggerDefinition } from '../config/swagger';

// __dirname here = dist/scripts  →  parent = dist  (where all compiled routes live)
const distDir = path.resolve(__dirname, '..');

const spec = swaggerJsdoc({
  definition: swaggerDefinition,
  apis: [
    path.join(distDir, '**', '*.routes.js'),
    path.join(distDir, 'app.js'),
  ],
});

const paths = Object.keys((spec as Record<string, unknown>).paths as object ?? {}).length;
if (paths === 0) {
  console.error('❌ generateSwagger: 0 endpoints found — check apis glob paths');
  process.exit(1);
}

const outPath = path.join(distDir, 'swagger-spec.json');
fs.writeFileSync(outPath, JSON.stringify(spec));
console.log(`✅ Swagger spec: ${paths} endpoints → ${outPath}`);
