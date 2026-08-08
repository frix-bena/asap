const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { Pool }        = require("pg");
const { PrismaPg }   = require("@prisma/adapter-pg");
const { PrismaClient } = require("@prisma/client");

const connectionString = process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5433/investdb";
const pool   = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

module.exports = { prisma };
