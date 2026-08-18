const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

// Boot ROI worker (registers cron job)
require("./workers/roiWorker");

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));

const corsOptions = {
  origin: (origin, callback) => {
    // Allow any origin (localhost with any port, LAN IP, file://, Postman, etc.)
    callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/(.*)/, cors(corsOptions));
app.use(express.json());
app.use(morgan("dev"));

// Serve website static files
app.use("/website", express.static(path.join(__dirname, "../website")));
app.get("/", (req, res) => res.redirect("/website/index.html"));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/wallet", require("./routes/wallet"));
app.use("/api/mpesa", require("./routes/mpesa"));
app.use("/api/invest", require("./routes/invest"));
app.use("/api/history", require("./routes/history"));

// Health check
app.get("/health", (req, res) =>
  res.json({ status: "ok", app: process.env.APP_NAME || "vault agencies", ts: new Date().toISOString() })
);

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
