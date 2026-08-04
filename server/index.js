require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const helmet  = require("helmet");
const morgan  = require("morgan");
const path    = require("path");

// Boot ROI worker (registers cron job)
require("./workers/roiWorker");

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: ["http://127.0.0.1:3000", "http://localhost:3000"],
  credentials: true,
}));
app.use(express.json());
app.use(morgan("dev"));

// Serve website static files
app.use("/website", express.static(path.join(__dirname, "../website")));
app.get("/", (req, res) => res.redirect("/website/index.html"));

// Routes
app.use("/api/auth",    require("./routes/auth"));
app.use("/api/wallet",  require("./routes/wallet"));
app.use("/api/invest",  require("./routes/invest"));
app.use("/api/history", require("./routes/history"));

// Health check
app.get("/health", (req, res) => res.json({ status: "ok", ts: new Date().toISOString() }));

// Admin: manually trigger ROI (dev only)
if (process.env.NODE_ENV === "development") {
  const { runDailyRoi } = require("./workers/roiWorker");
  app.post("/admin/trigger-roi", async (req, res) => {
    await runDailyRoi();
    res.json({ message: "ROI run complete." });
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
