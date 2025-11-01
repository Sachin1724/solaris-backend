// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const connectDB = require("./config/db");
const SolarData = require("./models/SolarData");

// Import data route
const dataRoutes = require("./routes/dataRoutes");

const app = express();
app.use(cors()); // Enable CORS for all routes
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Connect MongoDB
connectDB();

// --- Use API Routes ---
app.use("/api/data", dataRoutes);

// HTTP server
const server = app.listen(PORT, () =>
  console.log(`🌞 Solaris backend running on port ${PORT}`)
);

// --- WebSocket server (UPDATED) ---
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🟢 ESP32 Connected via WebSocket");

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      console.log("📥 Received:", data);

      // --- UPDATED MAPPING (to match new ESP32 code) ---
      const entry = new SolarData({
        temperature: data.t,
        humidity: data.h,
        dustVoltage: data.dustV,  // Changed from data.dV
        dustDensity: data.dust,   // Changed from data.d
        ldrRaw: data.ldr,         // Changed from data.lL
        ldrPercent: data.ldrPct,  // Changed from data.lR
        voltage: data.v,
        current: data.i,
        power: data.p,
        tiltAngle: data.tilt,     // NEW field
      });
      // --- END UPDATED MAPPING ---

      await entry.save();

      ws.send("✅ Data received & stored");
    } catch (err) {
      console.error("❌ Error processing message:", err.message);
      ws.send("❌ Error: Invalid data format");
    }
  });

  ws.on("close", () => console.log("🔴 ESP32 Disconnected"));

  ws.on("error", (err) => {
    console.error("❌ WebSocket Error:", err.message);
  });
});

// Root route
app.get("/", (req, res) => res.send("Solaris WebSocket Server is Live"));

// Handle server errors
server.on("error", (err) => {
  console.error("❌ Server Error:", err.message);
});