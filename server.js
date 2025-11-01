// server.js (UPDATED WITH GEMINI API ALERTS & WEBSOCKET BROADCAST)
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const connectDB = require("./config/db");
const SolarData = require("./models/SolarData");
const dataRoutes = require("./routes/dataRoutes");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// --- Gemini API Setup ---
if (!process.env.GEMINI_API_KEY) {
  console.warn("GEMINI_API_KEY not found in .env file. AI alerts will be disabled.");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-pro" });
const alertCooldowns = new Map(); // For rate limiting alerts
const COOLDOWN_PERIOD = 30 * 60 * 1000; // 30 minutes

// Connect MongoDB
connectDB();

// --- API Routes ---
app.use("/api/data", dataRoutes);

// --- Alerting Function ---
async function generateHumanizedAlert(wss, level, simpleMessage, data) {
  const alertType = level;
  
  // Check if this alert type is on cooldown
  const lastAlertTime = alertCooldowns.get(alertType);
  if (lastAlertTime && (Date.now() - lastAlertTime < COOLDOWN_PERIOD)) {
    console.log(`(Alert for '${alertType}' is on cooldown. Skipping.)`);
    return;
  }

  console.log("===================================");
  console.log(`🚨 SOLARIS ALERT [${level}] 🚨`);
  console.log(`Trigger: ${simpleMessage}`);
  console.log("Data:", data);

  let humanizedAlert = `[${level}] ${simpleMessage}`; // Default message

  // Call Gemini API only if the key is set
  if (process.env.GEMINI_API_KEY) {
    try {
      const prompt = `
        You are an AI assistant for a solar panel monitoring system named Solaris.
        An automated alert was triggered. Based on the following data, write a short, human-friendly, personalized alert (max 2 sentences) for the system owner.
        Explain the problem and the recommended action in a helpful, not-too-technical tone.

        Alert Level: ${level}
        Simple Message: ${simpleMessage}
        Sensor Data: ${JSON.stringify(data, null, 2)}
      `;

      const result = await geminiModel.generateContent(prompt);
      const response = await result.response;
      humanizedAlert = response.text(); // Get AI-generated message

      console.log("\n--- AI-Generated Alert ---");
      console.log(humanizedAlert);
      console.log("----------------------------");
      
      // Reset cooldown after a successful alert
      alertCooldowns.set(alertType, Date.now());

    } catch (err) {
      console.error("❌ Error generating AI alert:", err.message);
    }
  } else {
    console.log("(AI alert generation skipped: No API key provided.)");
  }
  console.log("===================================");

  // --- NEW: Broadcast alert to all connected frontend clients ---
  if (wss && wss.clients) {
    const alertMessage = JSON.stringify({
      type: "gemini-alert",
      level: level,
      message: humanizedAlert,
    });
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // 1 = WebSocket.OPEN
        client.send(alertMessage);
      }
    });
  }
}

// HTTP server
const server = app.listen(PORT, () =>
  console.log(`🌞 Solaris backend running on port ${PORT}`)
);

// --- WebSocket server (UPDATED WITH AI ALERT TRIGGERS) ---
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🟢 ESP32 Connected via WebSocket");

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      console.log("📥 Received:", data);

      // --- 1. Save to MongoDB ---
      const entry = new SolarData({
        temperature: data.t,
        humidity: data.h,
        dustVoltage: data.dustV,
        dustDensity: data.dust,
        ldrRaw: data.ldr,
        ldrPercent: data.ldrPct,
        voltage: data.v,
        current: data.i,
        power: data.p,
        tiltAngle: data.tilt,
      });
      await entry.save();
      ws.send("✅ Data received & stored");

      // --- 2. Rule-Based Alerting Engine (Triggers Gemini) ---
      
      // RULE 1: Low Power Alert
      // If it's daytime (LDR < 90%) but power is very low (e.g., < 1W).
      if (data.ldrPct < 90 && data.p < 1.0) {
        generateHumanizedAlert(
          wss, // Pass the WebSocket Server object
          "CRITICAL",
          "Low power output during daylight.",
          { ldr_percent: data.ldrPct, power_W: data.p }
        );
      }

      // RULE 2: High Dust Alert (e.g., density > 100)
      if (data.dust > 100) {
        generateHumanizedAlert(
          wss, // Pass the WebSocket Server object
          "WARNING",
          "High dust density detected.",
          { dust_density: data.dust }
        );
      }
      
      // RULE 3: Overheating Alert (e.g., > 50°C)
      if (data.t > 50) {
        generateHumanizedAlert(
          wss, // Pass the WebSocket Server object
          "WARNING",
          "Panel is overheating.",
          { temperature_C: data.t }
        );
      }

    } catch (err) {
      console.error("❌ Error:", err.message);
    }
  });

  ws.on("close", () => console.log("🔴 ESP32 Disconnected"));
});

// Root route
app.get("/", (req, res) => res.send("Solaris WebSocket Server is Live"));