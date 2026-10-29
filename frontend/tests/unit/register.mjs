// Test loader: resolves the "@/..." alias to the frontend root and adds the .ts extension. Run via `npm run test:unit`.
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
