// config/db.js
const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    // Removed deprecated options
    await mongoose.connect(process.env.DB_URI);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err);
    process.exit(1);
  }
};

module.exports = connectDB;