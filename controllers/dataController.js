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

// GET /api/data/efficiency/:period
exports.getEfficiencyData = async (req, res) => {
  const { period } = req.params;
  if (!["daily", "weekly", "monthly"].includes(period)) {
    return res.status(400).json({ msg: "Invalid period. Use 'daily', 'weekly', or 'monthly'." });
  }

  const { start, end } = getAggDateRange(period);

  try {
    const agg = await SolarData.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end }, // <-- FIXED
          ldrPercent: { $lt: 90 } // Only include daylight hours
        }
      },
      {
        $group: {
          _id: null,
          avgPower: { $avg: "$power" },
          totalPower: { $sum: "$power" }, 
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
    const lastEntry = await SolarData.findOne().sort({ createdAt: -1 }); // <-- FIXED

    if (!lastEntry) {
      return res.status(404).json({ msg: "No data received from device yet." });
    }
    
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const avgStatsArr = await SolarData.aggregate([
        { $match: { createdAt: { $gte: yesterday } } }, // <-- FIXED
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
    
    const avgStats = avgStatsArr.length > 0 ? avgStatsArr[0] : null;

    const report = {
      deviceId: "ESP32-Solaris-01",
      lastSeen: lastEntry.createdAt, // <-- FIXED
      liveStatus: {
        power: lastEntry.power ?? 0,
        temperature: lastEntry.temperature ?? 0,
        dustDensity: lastEntry.dustDensity ?? 0
      },
      average_24h: avgStats ? {
        _id: null,
        avgPower: avgStats.avgPower ?? 0,
        avgTemp: avgStats.avgTemp ?? 0,
        avgHumidity: avgStats.avgHumidity ?? 0,
        avgDust: avgStats.avgDust ?? 0
      } : null
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
    const lastEntry = await SolarData.findOne().sort({ createdAt: -1 }); // <-- FIXED
    
    if (!lastEntry) {
      return res.status(404).json({ msg: "No data found." });
    }

    const MAX_DUST_DENSITY = 200; 
    const dustDensity = lastEntry.dustDensity ?? 0;
    const dustPercentage = Math.min((dustDensity / MAX_DUST_DENSITY) * 100, 100); 

    res.json({
      dustDensity: dustDensity,
      dustPercentage: dustPercentage.toFixed(2),
      maxDensityForCalc: MAX_DUST_DENSITY
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
};


// GET /api/data (Your original route)
exports.getAllData = async (req, res) => {
  try {
    // --- THIS IS THE MOST IMPORTANT FIX ---
    const data = await SolarData.find().sort({ createdAt: -1 }).limit(100); // <-- FIXED
    res.json({ data: data }); // <-- Make sure to send data in an object { data: ... }
  } catch (err) {
    console.error(err.message);
    res.status(500).send("Server Error");
  }
};