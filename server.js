// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws"); // Native WebSockets for ESP32
const { Server } = require("socket.io"); // Socket.IO for Frontend
const connectDB = require("./config/db");
const SolarData = require("./models/SolarData");
const dataRoutes = require("./routes/dataRoutes");
const url = require("url");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Connect MongoDB
connectDB();

// --- API Routes ---
app.use("/api/data", dataRoutes);

// --- Create HTTP Server ---
const server = http.createServer(app);

// --- 1. Socket.IO Server (Frontend) ---
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("🔵 Frontend Dashboard Connected:", socket.id);
  socket.on("disconnect", () => {
    console.log("🔴 Frontend Dashboard Disconnected:", socket.id);
  });
});

// --- 2. WebSocket Server (ESP32) ---
// We use { noServer: true } to manually route traffic
const wss = new WebSocketServer({
  noServer: true,
  skipUTF8Validation: true, // Safety for ESP32 data
});

// Handle errors on the WS server level
wss.on("error", (err) => {
  console.error("🚨 WebSocket Server Error:", err.message);
});

wss.on("connection", (ws) => {
  console.log("🟢 ESP32 Connected via WebSocket");

  // Handle errors on the specific client connection
  ws.on("error", (err) => {
    console.error("⚠️ ESP32 Client Error:", err.message);
  });

  ws.on("message", async (msg) => {
    let data;
    try {
      data = JSON.parse(msg.toString());
      console.log("📥 Received from ESP32:", data);
    } catch (err) {
      console.error("❌ Invalid JSON from ESP32:", msg.toString());
      return;
    }

    try {
      // --- Schema Mapping (Matches new ESP32 code) ---
      const entry = new SolarData({
        temperature: data.t,
        humidity: data.h,
        dustVoltage: data.dustV,
        dustDensity: data.dust,   // Mapped from 'dust'
        ldrRaw: data.ldr,        // Mapped from 'ldr' (LDR1)
        ldrPercent: data.ldrPct,
        voltage: data.v,
        current: data.i,
        power: data.p,
        tiltAngle: data.tilt,    // ADDED: Map 'tilt' to 'tiltAngle'
      });
      // --- End Mapping ---

      const savedEntry = await entry.save();

      // Broadcast to Frontend
      io.emit("newData", savedEntry);

      // Acknowledge ESP32
      if (ws.readyState === ws.OPEN) {
        ws.send("✅ Data received & stored");
      }
    } catch (err) {
      console.error("❌ Error processing data:", err.message);
    }
  });

  ws.on("close", () => console.log("🔴 ESP32 Disconnected"));
});

// --- 3. Manual Upgrade Handling (The Protocol Bridge) ---
server.on("upgrade", (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;

  // ESP32 connects to "/"
  if (pathname === "/") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } 
  // Other requests (like /socket.io/) are handled by Socket.IO's listener
});

// Root route
app.get("/", (req, res) => res.send("Solaris Server is Live"));

// --- Start Server ---
server.listen(PORT, () =>
  console.log(`🌞 Solaris backend running on port ${PORT}`)
);