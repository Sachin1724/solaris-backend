// models/SolarData.js
const mongoose = require("mongoose");

const SolarDataSchema = new mongoose.Schema(
  {
    temperature: Number,
    humidity: Number,
    dustVoltage: Number,

    // --- CORRECTIONS ---
    // These fields now match what server.js provides
    dust: Number,       // CHANGED from dustDensity
    ldr: Number,        // CHANGED from ldrLeft
    ldrPercent: Number, // CHANGED from ldrRight
    // -------------------

    voltage: Number,
    current: Number,
    power: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model("SolarData", SolarDataSchema);