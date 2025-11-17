// config/db.js
const mongoose = require("mongoose");

const connectDB = async () => {
  const uri = process.env.DB_URI || "mongodb://127.0.0.1:27017/solaris";
  if (!process.env.DB_URI) {
    console.warn(
      "⚠️  `DB_URI` environment variable not set — falling back to `mongodb://127.0.0.1:27017/solaris`."
    );
  }

  try {
    await mongoose.connect(uri);
    console.log("✅ MongoDB Connected");
  } catch (err) {
    console.error("❌ MongoDB Connection Failed:", err);
    process.exit(1);
  }
};

module.exports = connectDB;