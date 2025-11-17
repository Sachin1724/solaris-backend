// controllers/dataController.js
const SolarData = require("../models/SolarData");

// @desc    Get all solar data with filtering and sorting
// @route   GET /api/data
// @access  Public
exports.getAllData = async (req, res) => {
  try {
    const { startDate, endDate, sortBy, order } = req.query;

    // 1. Build Filter Object (for date range)
    const filter = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        // gte = greater than or equal
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        // lte = less than or equal
        // Add 1 day to endDate to include the entire day
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        filter.createdAt.$lte = end;
      }
    }

    // 2. Build Sort Object
    const sort = {};
    if (sortBy) {
      // order can be 'asc' or 'desc'
      sort[sortBy] = order === "desc" ? -1 : 1;
    } else {
      // Default sort: newest first
      sort.createdAt = -1;
    }

    // 3. Execute Query
    const data = await SolarData.find(filter).sort(sort);

    res.status(200).json({
      success: true,
      count: data.length,
      data: data,
    });
  } catch (err) {
    console.error("❌ Error fetching data:", err.message);
    res.status(500).json({ success: false, error: "Server Error" });
  }
};

// @desc    Get most recent solar data entries (limit)
// @route   GET /api/data/latest?limit=100
// @access  Public
exports.getLatestData = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    // fetch newest first then reverse so frontend gets chronological order
    let data = await SolarData.find({}).sort({ createdAt: -1 }).limit(limit);
    data = data.reverse();

    res.status(200).json({ success: true, count: data.length, data });
  } catch (err) {
    console.error("❌ Error fetching latest data:", err && err.message ? err.message : err);
    res.status(500).json({ success: false, error: "Server Error" });
  }
};