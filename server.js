// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { Server } = require("socket.io"); // --- ADDED ---
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

// --- ADDED: Socket.io server for Dashboard Clients ---
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
// --- END: Socket.io server ---

// --- EXISTING: WebSocket server for ESP32 ---
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🟢 ESP32 Connected via WebSocket");

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      console.log("📥 Received from ESP32:", data);

      // Match field names to your ESP32 output
      const entry = new SolarData({
        temperature: data.t,
        humidity: data.h,
        dustVoltage: data.dustV,
        dust: data.dust,
        ldr: data.ldr,
        ldrPercent: data.ldrPct,
        voltage: data.v,
        current: data.i,
        power: data.p,
      });

      await entry.save();
      console.log("✅ Data saved to MongoDB");
      
      // --- ADDED: Broadcast the new entry to all dashboard clients ---
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