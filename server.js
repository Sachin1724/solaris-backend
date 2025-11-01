// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const SolarData = require("./models/SolarData");
const dataRoutes = require("./routes/dataRoutes");

// --- Import TensorFlow.js and File System ---
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

// --- Global variables for ML Model and Scaler ---
let model;
let scalerParams;
// This MUST match the features used in your Python training script
const FEATURES_COUNT = 4; // temperature, humidity, dust, ldrPercent

// --- Define Alert Thresholds (Tune these) ---
const DUST_THRESHOLD = 3.0; // From your 'dust' sensor reading (e.g., 3.0 mg/m^3)
const LOW_POWER_THRESHOLD = 10; // Alert if daytime power is < 10mW
const DAYLIGHT_THRESHOLD = 30; // 'ldrPercent' value to consider it "daytime"
const PREDICTED_DROP_THRESHOLD = 5.0; // Alert if model predicts > 5% efficiency loss

// --- Function to load the model and scaler params ---
async function loadModelAndScaler() {
  try {
    // 1. Load Scaler Parameters
    const paramsData = fs.readFileSync("scaler_params.json", "utf8");
    scalerParams = JSON.parse(paramsData);
    console.log("✅ Scaler parameters loaded.");

    // 2. Load the TensorFlow.js Model
    // Note: 'file://' is required for tfjs-node to load from disk
    const modelPath = "file://tf_model/model.json";
    model = await tf.loadLayersModel(modelPath);
    console.log("✅ ML Model loaded from 'tf_model/'.");
    // model.summary(); // Uncomment to see model architecture
  } catch (err) {
    console.error("❌ Error loading model or scaler:", err.message);
    console.error(
      "Please make sure 'scaler_params.json' and the 'tf_model' directory are in the same folder as server.js."
    );
  }
}

// --- Helper Function to Send Alerts ---
function sendAlert(type, message, data) {
  console.warn(`🚨 ALERT: [${type}] - ${message}`, data || "");
  // Emit to your dashboard
  io.emit("alert", {
    type,
    message,
    data,
    timestamp: new Date().toISOString(),
  });
}

// --- Function to Run Prediction and Alerts ---
async function runPredictionAndAlert(entry) {
  // --- 1. Check for simple, direct alerts ---

  // Alert 1: Dust Alert
  if (entry.dust > DUST_THRESHOLD) {
    sendAlert(
      "DUST",
      `Dust level is high (${entry.dust.toFixed(
        2
      )}). Panel cleaning recommended.`,
      { dust: entry.dust }
    );
  }

  // Alert 2: Low Power Alert
  if (entry.power < LOW_POWER_THRESHOLD && entry.ldrPercent > DAYLIGHT_THRESHOLD) {
    sendAlert(
      "LOW_POWER",
      `Power output is ${entry.power.toFixed(
        2
      )}mW, which is low for daylight conditions.`,
      { power: entry.power, ldrPercent: entry.ldrPercent }
    );
  }

  // --- 2. Run ML Model for Performance Alert ---
  if (!model || !scalerParams) {
    console.log("Model/scaler not loaded, skipping ML prediction.");
    return;
  }

  try {
    // A. Prepare features in the *exact* order from training:
    // [temperature, humidity, dust_accumulation, sunlight_hours]
    const features = [
      entry.temperature,
      entry.humidity,
      entry.dust,
      entry.ldrPercent, // Using ldrPercent as proxy for sunlight_hours
    ];

    // B. Manually scale the features
    const scaledFeatures = features.map((val, i) => {
      return (val - scalerParams.mean[i]) / scalerParams.scale[i];
    });

    // C. Create a TensorFlow tensor
    const inputTensor = tf.tensor2d([scaledFeatures], [1, FEATURES_COUNT]);

    // D. Run the prediction
    const predictionTensor = model.predict(inputTensor);
    const predictedDrop = (await predictionTensor.data())[0];

    // E. Clean up tensors
    inputTensor.dispose();
    predictionTensor.dispose();

    console.log(
      `🤖 ML Prediction: Predicted Efficiency Drop = ${predictedDrop.toFixed(2)}%`
    );

    // Alert 3: ML Performance Alert
    if (predictedDrop > PREDICTED_DROP_THRESHOLD) {
      sendAlert(
        "PERFORMANCE",
        `High efficiency drop predicted (${predictedDrop.toFixed(
          2
        )}%). Check panel health.`,
        { predictedDrop, ...entry.toObject() }
      );
    }
  } catch (err) {
    console.error("❌ Error during model prediction:", err.message);
  }
}

// --- Start HTTP Server ---
const server = app.listen(PORT, () => {
  console.log(`🚀 HTTP Server running on http://localhost:${PORT}`);
});

// --- Setup Socket.IO for Dashboard ---
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000", // Allow your React (or other) frontend
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("🟢 Dashboard Client Connected via Socket.IO");
  socket.on("disconnect", () => {
    console.log("⚪ Dashboard Client Disconnected");
  });
});

// --- Setup WebSocket Server for ESP32 ---
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

      // --- Calculate Actual_Power ---
      const actualPower = data.v * data.i;

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
        power: actualPower,
      });

      await entry.save();
      console.log("✅ Data saved to MongoDB");

      // Broadcast the new entry to all dashboard clients
      io.emit("newData", entry);

      // --- Run the prediction and alert logic ---
      runPredictionAndAlert(entry);

      ws.send("✅ Data received & stored");
    } catch (err) {
      console.error("❌ Error parsing/saving data:", err.message);
      ws.send("❌ Invalid data format");
    }
  });

  ws.on("close", () => {
    console.log("⚪ ESP32 Disconnected");
  });
});

// --- Load the model on server startup ---
loadModelAndScaler();