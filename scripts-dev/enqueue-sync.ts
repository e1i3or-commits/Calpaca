// Dev helper: enqueue a calendar-sync job for every google connection.
// The running dev server's pg-boss worker picks it up.
// Run: bun run scripts-dev/enqueue-sync.ts
import { enqueueSync, getBoss } from "../src/jobs/index";
import { listGoogleConnections } from "../src/db/sync-repo";

const boss = getBoss();
await boss.start();
for (const conn of await listGoogleConnections()) {
  await enqueueSync(conn.id);
  console.log(`enqueued sync for ${conn.id}`);
}
await boss.stop({ close: true });
process.exit(0);
