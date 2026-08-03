require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const helmet   = require("helmet");
const morgan   = require("morgan");
const path     = require("path");

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(morgan("dev"));

// Serve website
app.use("/", express.static(path.join(__dirname, "../website")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../website/index.html")));

// API routes
app.use("/api/auth",    require("./routes/auth"));
app.use("/api/invest",  require("./routes/investments"));
app.use("/api/wallet",  require("./routes/wallet"));
app.use("/api/mpesa",   require("./routes/mpesa"));

// Health
app.get("/api/health", (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Global error handler
app.use((err, req, res, _next) => {
  const code  = err.code || "INTERNAL";
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || "Internal server error.", code });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🔐 Vault API → http://localhost:${PORT}`));
