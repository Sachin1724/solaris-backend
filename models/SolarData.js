// models/SolarData.js
const mongoose = require("mongoose");

const SolarDataSchema = new mongoose.Schema(
  {
    temperature: Number,
    humidity: Number,
    dustVoltage: Number,
    dustDensity: Number,
    ldrRaw: Number,       // Replaces ldrLeft
    ldrPercent: Number,   // Replaces ldrRight
    voltage: Number,
    current: Number,
    power: Number,
    tiltAngle: Number,    // NEW field (for signed angle)
  },
  { timestamps: true }
);

module.exports = mongoose.model("SolarData", SolarDataSchema);