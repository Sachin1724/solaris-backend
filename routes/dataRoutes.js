// routes/dataRoutes.js
const express = require("express");
const router = express.Router();
const {
  getAllData,
  getEfficiencyData,
  getDeviceReport,
  getLatestDustReading
} = require("../controllers/dataController");

// --- NEW ROUTES ---

// For "Efficiency Tab"
// GET /api/data/efficiency/daily
// GET /api/data/efficiency/weekly
// GET /api/data/efficiency/monthly
router.get("/efficiency/:period", getEfficiencyData);

// For "Device Report"
// GET /api/data/devicereport
router.get("/devicereport", getDeviceReport);

// For "Dust Percentage"
// GET /api/data/dust
router.get("/dust", getLatestDustReading);


// --- Original Route ---
// GET /api/data
router.get("/", getAllData);


module.exports = router;