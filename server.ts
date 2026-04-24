import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cron from "node-cron";
import { runSyncTask } from "./scripts/sync.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Hourly Sync Task
  // Run every hour at minute 0
  cron.schedule("0 * * * *", async () => {
    console.log("[Cron] Running hourly GPF sync...");
    try {
      await runSyncTask();
      console.log("[Cron] Hourly sync completed successfully.");
    } catch (error) {
      console.error("[Cron] Hourly sync failed:", error);
    }
  });

  // Run immediately on start to ensure data is fresh
  console.log("[Server] Initial sync triggered...");
  runSyncTask().catch(err => console.error("[Server] Initial sync error:", err));

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
