// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const SolarData = require("./models/SolarData");
const dataRoutes = require("./routes/dataRoutes");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Connect MongoDB
connectDB();

// API Routes
app.use("/api/data", dataRoutes);

// Create HTTP server
const server = app.listen(PORT, () => {
  console.log(`🌞 Solaris backend running on port ${PORT}`);
});

<<<<<<< HEAD
// --- WebSocket server (UPDATED) ---
=======
// --- Socket.io server for Dashboard Clients ---
const io = new Server(server, {
  cors: {
    origin: "*", // For development. In production, change to your frontend URL
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("💻 Dashboard Client Connected via Socket.io:", socket.id);
  socket.on("disconnect", () => {
    console.log("🔌 Dashboard Client Disconnected:", socket.id);
  });
});

// --- EXISTING: WebSocket server for ESP32 ---
>>>>>>> 56cb62df1091db6f143e2b3e1eddafe142496b8e
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🟢 ESP32 Connected via WebSocket");

  // --- ADDED: Error handler for the ESP32 connection ---
  // This will catch errors from this specific ESP32 connection
  // and prevent the entire server from crashing.
  ws.on("error", (err) => {
    console.error("❌ ESP32 WebSocket Error:", err.message);
    // No need to throw; just log it. The 'close' event will
    // likely be triggered automatically after this.
  });
  // --- END OF FIX ---

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      console.log("📥 Received from ESP32:", data);

<<<<<<< HEAD
      // --- UPDATED MAPPING ---
      // Save to MongoDB
      const entry = new SolarData({
        temperature: data.t,
        humidity: data.h,
        dustVoltage: data.dustV,  // Changed from data.dV
        dustDensity: data.dust,   // Changed from data.d
        ldrRaw: data.ldr,         // Changed from data.lL
        ldrPercent: data.ldrPct,  // Changed from data.lR
=======
      // Match field names to your ESP32 output
      const entry = new SolarData({
        temperature: data.t,
        humidity: data.h,
        dustVoltage: data.dustV,
        dust: data.dust,
        ldr: data.ldr,
        ldrPercent: data.ldrPct,
>>>>>>> 56cb62df1091db6f143e2b3e1eddafe142496b8e
        voltage: data.v,
        current: data.i,
        power: data.p,
        tiltAngle: data.tilt,     // NEW field
      });
<<<<<<< HEAD
      // --- END UPDATED MAPPING ---

      await entry.save();
=======
>>>>>>> 56cb62df1091db6f143e2b3e1eddafe142496b8e

      await entry.save();
      console.log("✅ Data saved to MongoDB");
      
      // Broadcast the new entry to all dashboard clients
      io.emit("newData", entry);
      
      ws.send("✅ Data received & stored");
    } catch (err) {
      console.error("❌ Error parsing/saving data:", err.message);
      ws.send("❌ Invalid data format");
    }
  });

  ws.on("close", () => console.log("🔴 ESP32 Disconnected"));
});
// --- END: WebSocket server ---

// Root route
app.get("/", (req, res) => res.send("☀️ Solaris WebSocket Server Live"));