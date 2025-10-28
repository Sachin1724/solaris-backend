require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const connectDB = require("./config/db");
const SolarData = require("./models/SolarData");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Connect MongoDB
connectDB();

// HTTP server
const server = app.listen(PORT, () =>
  console.log(`🌞 Solaris backend running on port ${PORT}`)
);

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🟢 ESP32 Connected via WebSocket");

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      console.log("📥 Received:", data);

      // Save to MongoDB
      const entry = new SolarData({
        temperature: data.t,
        humidity: data.h,
        dustVoltage: data.dV,
        dustDensity: data.d,
        ldrLeft: data.lL,
        ldrRight: data.lR,
        voltage: data.v,
        current: data.i,
        power: data.p,
      });
      await entry.save();

      ws.send("✅ Data received & stored");
    } catch (err) {
      console.error("❌ Error:", err.message);
    }
  });

  ws.on("close", () => console.log("🔴 ESP32 Disconnected"));
});

app.get("/", (req, res) => res.send("Solaris WebSocket Server is Live"));