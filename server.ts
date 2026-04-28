import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cron from "node-cron";
import { runSyncTask, syncFNG, runAutoDCA } from "./scripts/sync.ts";

async function startServer() {
  const app = express();
  const PORT = 3000;

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
    
    // Start background tasks AFTER server is up
    try {
      // Hourly GPF Sync Task
      cron.schedule("0 * * * *", async () => {
        console.log("[Cron] Running hourly GPF sync...");
        try {
          await runSyncTask();
          console.log("[Cron] Hourly sync completed successfully.");
        } catch (error) {
          console.error("[Cron] Hourly sync failed:", error);
        }
      });

      // 15-Minute FNG Sync Task
      cron.schedule("*/15 * * * *", async () => {
        console.log("[Cron] Running 15-minute FNG sync...");
        try {
          await syncFNG();
        } catch (error) {
          console.error("[Cron] FNG sync failed:", error);
        }
      });

      // Daily Auto-DCA Update at 12:00 Thailand Time (05:00 UTC)
      cron.schedule("0 5 * * *", async () => {
        console.log("[Cron] Running daily Auto-DCA update (12:00 BKK)...");
        try {
          await runAutoDCA();
          console.log("[Cron] Auto-DCA update completed successfully.");
        } catch (error) {
          console.error("[Cron] Auto-DCA update failed:", error);
        }
      });

      // Initial sync
      console.log("[Server] Initial sync triggered...");
      (async () => {
        try {
          await syncFNG();
          await runSyncTask();
        } catch (e) {
          console.error("[Server] Initial sync error:", e);
        }
      })();
    } catch (err) {
      console.error("[Server] Error setting up cron tasks:", err);
    }
  });
}

startServer();
