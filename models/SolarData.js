// models/SolarData.js
const mongoose = require("mongoose");

const SolarDataSchema = new mongoose.Schema(
  {
    temperature: Number,
    humidity: Number,
    dustVoltage: Number,
    dustDensity: Number,
    ldrRaw: Number,       // Replaced ldrLeft
    ldrPercent: Number,   // Replaced ldrRight
    voltage: Number,
    current: Number,
    power: Number,
    tiltAngle: Number,    // New field
  },
  { timestamps: true }
);

module.exports = mongoose.model("SolarData", SolarDataSchema);