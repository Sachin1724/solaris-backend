// controllers/dataController.js
const SolarData = require("../models/SolarData");

// Helper function to get start/end dates
const getAggDateRange = (period) => {
  const end = new Date();
  const start = new Date();

  if (period === "daily") {
    start.setHours(0, 0, 0, 0); // Start of today
  } else if (period === "weekly") {
    start.setDate(start.getDate() - start.getDay()); // Start of this week (Sunday)
    start.setHours(0, 0, 0, 0);
  } else if (period === "monthly") {
    start.setDate(1); // Start of this month
    start.setHours(0, 0, 0, 0);
  }
  return { start, end };
};

// GET /api/data/efficiency/:period (e.g., :period = "daily", "weekly", "monthly")
exports.getEfficiencyData = async (req, res) => {
  const { period } = req.params;
  if (!["daily", "weekly", "monthly"].includes(period)) {
    return res.status(400).json({ msg: "Invalid period. Use 'daily', 'weekly', or 'monthly'." });
  }

  const { start, end } = getAggDateRange(period);

  try {
    // MongoDB Aggregation Pipeline
    const agg = await SolarData.aggregate([
      {
        $match: {
          timestamp: { $gte: start, $lte: end },
          ldrPercent: { $lt: 90 } // Only include daylight hours
        }
      },
      {
        $group: {
          _id: null, // Group all matched documents together
          avgPower: { $avg: "$power" },
          totalPower: { $sum: "$power" }, // Note: This isn't "total energy (Wh)" yet
          avgTemp: { $avg: "$temperature" },
          avgDust: { $avg: "$dustDensity" },
          count: { $sum: 1 }
        }
      }
    ]);

    if (agg.length === 0) {
      return res.json({ msg: "No daylight data found for this period.", data: null });
    }

    res.json({
      period,
      from: start.toISOString(),
      to: end.toISOString(),
      data: agg[0]
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
};


// GET /api/data/devicereport
exports.getDeviceReport = async (req, res) => {
  try {
    // 1. Get the very last entry for "live" status
    const lastEntry = await SolarData.findOne().sort({ timestamp: -1 });

    if (!lastEntry) {
      return res.status(404).json({ msg: "No data received from device yet." });
    }
    
    // 2. Get 24-hour average stats
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const avgStats = await SolarData.aggregate([
        { $match: { timestamp: { $gte: yesterday } } },
        {
          $group: {
            _id: null,
            avgPower: { $avg: "$power" },
            avgTemp: { $avg: "$temperature" },
            avgHumidity: { $avg: "$humidity" },
            avgDust: { $avg: "$dustDensity" }
          }
        }
    ]);

    const report = {
      deviceId: "ESP32-Solaris-01", // You can make this dynamic if you add a device ID to your model
      lastSeen: lastEntry.timestamp,
      liveStatus: {
        power: lastEntry.power,
        temperature: lastEntry.temperature,
        dustDensity: lastEntry.dustDensity
      },
      average_24h: avgStats.length > 0 ? avgStats[0] : null
    };

    res.json(report);

  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
};


// GET /api/data/dust
exports.getLatestDustReading = async (req, res) => {
  try {
    const lastEntry = await SolarData.findOne().sort({ timestamp: -1 });
    
    if (!lastEntry) {
      return res.status(404).json({ msg: "No data found." });
    }

    // You asked for "percentage". Your sensor provides "density".
    // To get a percentage, you need to define the "max" density.
    // Example: Let's assume 0 is clean and 200 is 100% dirty.
    const MAX_DUST_DENSITY = 200; // --- ADJUST THIS VALUE ---
    const dustDensity = lastEntry.dustDensity;
    const dustPercentage = Math.min((dustDensity / MAX_DUST_DENSITY) * 100, 100); // Cap at 100%

    res.json({
      dustDensity: dustDensity,
      dustPercentage: dustPercentage.toFixed(2), // e.g., "45.50"
      maxDensityForCalc: MAX_DUST_DENSITY
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
};


// GET /api/data (Your original route to get all data)
exports.getAllData = async (req, res) => {
  try {
    // Get last 100 entries, sorted by newest first
    const data = await SolarData.find().sort({ timestamp: -1 }).limit(100);
    res.json(data);
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
};