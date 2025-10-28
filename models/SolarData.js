const mongoose = require("mongoose");

const SolarDataSchema = new mongoose.Schema(
  {
    temperature: Number,
    humidity: Number,
    dustVoltage: Number,
    dustDensity: Number,
    ldrLeft: Number,
    ldrRight: Number,
    voltage: Number,
    current: Number,
    power: Number,
  },
  { timestamps: true }
);

module.exports = mongoose.model("SolarData", SolarDataSchema);