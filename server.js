// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const SolarData = require("./models/SolarData");
const dataRoutes = require("./routes/dataRoutes");

// --- NEW: Import TensorFlow.js and File System ---
const tf = require("@tensorflow/tfjs-node");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Connect MongoDB
connectDB();

// API Routes
app.use("/api/data", dataRoutes);

// --- NEW: Global variables for ML Model and Scaler ---
let model;
let scalerParams;
// Define alert thresholds (you can tune these)
const DUST_THRESHOLD = 3.0; // Example: Alert if dust reading is > 3.0
const EFFICIENCY_DEVIATION_THRESHOLD = 0.25; // Alert if actual power is 25% less than predicted
const LOW_POWER_THRESHOLD = 10; // Alert if daytime power is < 10mW

// --- NEW: Function to load the model and scaler params ---
async function loadModelAndScaler() {
  try {
    const paramsData = fs.readFileSync("scaler_params.json", "utf8");
    scalerParams = JSON.parse(paramsData);
    console.log("✅ Scaler parameters loaded.");

    model = await tf.loadLayersModel("file://./solar_power_model.h5");
    console.log("🤖 ML Model loaded successfully.");
    // Warm up the model
    model.predict(tf.zeros([1, 3]));
    console.log("🤖 ML Model warmed up.");
  } catch (err) {
    console.error("❌ Error loading model or scaler:", err.message);
  }
}

// --- NEW: Function to run prediction and send alerts ---
async function runPredictionAndAlert(entry) {
  // Exit if model isn't loaded
  if (!model || !scalerParams) {
    console.log("Model not ready, skipping prediction.");
    return;
  }

  try {
    // --- 1. Rule-Based Alert: Dust ---
    // Uses the 'dust' field from your server.js model mapping (data.dust)
    if (entry.dust && entry.dust > DUST_THRESHOLD) {
      io.emit("alert", {
        type: "dust",
        message: `High dust detected (${entry.dust}). Cleaning recommended.`,
      });
    }

    // --- 2. ML-Based Alert: Efficiency & Low Power ---
    // Check if it's "daytime" based on LDR (matches training data logic)
    // We use ldrPercent from your server.js (data.ldrPct)
    const isDaytime = entry.ldrPercent < 90;

    if (!isDaytime) {
      return; // Don't check efficiency at night
    }

    // --- A. Preprocess the input data ---
    const inputData = [entry.temperature, entry.humidity, entry.ldrPercent];
    
    // Manually scale the data using loaded params
    const scaledInput = inputData.map((val, i) => {
      return (val - scalerParams.X_min[i]) * scalerParams.X_scale[i];
    });

    const inputTensor = tf.tensor2d([scaledInput], [1, 3]);

    // --- B. Run Prediction ---
    const predictionTensor = model.predict(inputTensor);
    const scaledPrediction = (await predictionTensor.data())[0];
    
    // --- C. Inverse-scale the prediction to get mW ---
    const predictedPower = (scaledPrediction / scalerParams.y_scale[0]) + scalerParams.y_min[0];

    // Clean up tensors
    inputTensor.dispose();
    predictionTensor.dispose();

    // --- D. Compare and Alert ---
    const actualPower = entry.power;
    const deviation = (predictedPower - actualPower) / predictedPower;

    if (deviation > EFFICIENCY_DEVIATION_THRESHOLD) {
      // Efficiency is significantly lower than expected
      io.emit("alert", {
        type: "efficiency",
        message: `Efficiency low. Power is ${Math.round(deviation * 100)}% lower than expected.`,
        details: {
          predicted: predictedPower.toFixed(2),
          actual: actualPower.toFixed(2),
        },
      });
    } else if (actualPower < LOW_POWER_THRESHOLD) {
      // Power is very low, even if efficiency is "ok" (e.g., panel is blocked)
      io.emit("alert", {
        type: "low_power",
        message: `Critically low power (${actualPower.toFixed(2)} mW) detected during the day.`,
      });
    }

  } catch (err) {
    console.error("❌ Error during prediction:", err.message);
  }
}

// Create HTTP server
const server = app.listen(PORT, async () => {
  console.log(`🌞 Solaris backend running on port ${PORT}`);
  // --- NEW: Load the model on server start ---
  await loadModelAndScaler();
});

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
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("🟢 ESP32 Connected via WebSocket");

  ws.on("error", (err) => {
    console.error("❌ ESP32 WebSocket Error:", err.message);
  });

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

      // Broadcast the new entry to all dashboard clients
      io.emit("newData", entry);

      // --- NEW: Run the prediction and alert logic ---
      runPredictionAndAlert(entry);

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