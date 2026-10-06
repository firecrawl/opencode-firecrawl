import { server } from "./v1.ts";
import { v2 } from "./v2.ts";

// One entrypoint for both hosts: OpenCode 1 calls `server()`, OpenCode 2 reads `id` and `setup()`.
export default { ...v2, server };
