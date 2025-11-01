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
const FEATURES_COUNT = 4; // Temp, Humidity, Brightness, HourOfDay

// --- NEW: Define Alert Thresholds (Tune these) ---
const DUST_THRESHOLD = 3.0; // From your 'dust' sensor reading
const EFFICIENCY_LOSS_THRESHOLD_MW = 15; // Alert if loss is > 15mW
const EFFICIENCY_LOSS_THRESHOLD_PERCENT = 0.30; // Alert if loss is > 30%
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
    model.predict(tf.zeros([1, FEATURES_COUNT]));
    console.log("🤖 ML Model warmed up.");
  } catch (err) {
    console.error("❌ Error loading model or scaler:", err.message);
  }
}

// --- NEW: Function to run prediction and send alerts ---
async function runPredictionAndAlert(entry) {
  if (!model || !scalerParams) {
    console.log("Model not ready, skipping prediction.");
    return;
  }

  try {
    // --- Alert 1: Dust (Rule-Based) ---
    // This uses the 'dust' field from your ESP32
    if (entry.dust && entry.dust > DUST_THRESHOLD) {
      io.emit("alert", {
        type: "dust",
        message: `High dust detected (${entry.dust}). Cleaning recommended.`,
      });
    }

    // --- ML-Based Alerts (Efficiency & Low Power) ---
    const isDaytime = entry.ldrPercent < 90;

    if (!isDaytime) {
      return; // Don't check efficiency at night
    }

    // --- 1. Get Features (as requested) ---
    const hourOfDay = new Date().getHours(); // Get current hour
    const inputData = [
      entry.temperature,
      entry.humidity,
      entry.ldrPercent, // This is 'Brightness (%)'
      hourOfDay,
    ];

    // --- 2. Scale Features ---
    const scaledInput = inputData.map((val, i) => {
      // (value - min) * scale
      // Note: scale = 1 / (max - min)
      return (val - scalerParams.X_min[i]) * scalerParams.X_scale[i];
    });

    const inputTensor = tf.tensor2d([scaledInput], [1, FEATURES_COUNT]);

    // --- 3. Run Prediction ---
    const predictionTensor = model.predict(inputTensor);
    const scaledPrediction = (await predictionTensor.data())[0];

    // --- 4. Un-scale Prediction to get Predicted_Power (mW) ---
    // (scaled_value / scale) + min
    const predictedPower = (scaledPrediction / scalerParams.y_scale[0]) + scalerParams.y_min[0];

    // Clean up tensors
    inputTensor.dispose();
    predictionTensor.dispose();

    // --- 5. Calculate Efficiency Loss (As you requested) ---
    const actualPower = entry.power; // This is now (V * I)
    const efficiencyLoss = predictedPower - actualPower;

    console.log(`Prediction: Actual(${actualPower.toFixed(2)}mW) vs. Predicted(${predictedPower.toFixed(2)}mW). Loss: ${efficiencyLoss.toFixed(2)}mW`);

    // --- Alert 2: Efficiency ---
    if (efficiencyLoss > EFFICIENCY_LOSS_THRESHOLD_MW && (efficiencyLoss / predictedPower) > EFFICIENCY_LOSS_THRESHOLD_PERCENT) {
      io.emit("alert", {
        type: "efficiency",
        message: `Efficiency low. Power is ${efficiencyLoss.toFixed(1)}mW lower than expected.`,
        details: {
          predicted: predictedPower.toFixed(2),
          actual: actualPower.toFixed(2),
        },
      });
    }
    
    // --- Alert 3: Low Power (Safety Net) ---
    else if (actualPower < LOW_POWER_THRESHOLD) {
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
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("💻 Dashboard Client Connected via Socket.io:", socket.id);
  socket.on("disconnect", () => {
    console.log("🔌 Dashboard Client Disconnected:", socket.id);
  });
});

// --- WebSocket server for ESP32 ---
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

      // --- MODIFIED: Calculate Actual_Power as requested ---
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
        power: actualPower, // --- MODIFIED: Save the calculated power
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