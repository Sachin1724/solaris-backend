// =====================================================
//  DATABASE WIPE UTILITY
//  Description: Connects to MongoDB Atlas and deletes
//  all documents from every collection while retaining
//  the schema/structure.
//  Author: Sachin Mallick
//  =====================================================

import { MongoClient } from "mongodb";

// === STEP 1: MongoDB Connection URI ===
// ⚠️ Replace with your actual MongoDB Atlas connection string
const uri = "mongodb+srv://Solaris:OG3STbTCxZzp6I15@solaris.mwzk25i.mongodb.net/?appName=Solaris";

// === STEP 2: Main logic ===
async function wipeDatabaseKeepCollections() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(); // Picks DB name from URI
    console.log(`✅ Connected to database: ${db.databaseName}`);

    // Get all collections
    const collections = await db.listCollections().toArray();

    if (collections.length === 0) {
      console.log("⚠️ No collections found in this database.");
      return;
    }

    console.log(`📂 Found ${collections.length} collections.`);
    
    // Wipe data but keep collections
    for (const collInfo of collections) {
      const collection = db.collection(collInfo.name);
      const count = await collection.countDocuments();

      if (count > 0) {
        const result = await collection.deleteMany({});
        console.log(`🧹 Cleared ${result.deletedCount} docs from "${collInfo.name}"`);
      } else {
        console.log(`✅ "${collInfo.name}" already empty.`);
      }
    }

    console.log("\n🎉 All collections wiped successfully (structure retained).");
  } catch (err) {
    console.error("❌ Error while wiping data:", err);
  } finally {
    await client.close();
  }
}

// === STEP 3: Execute ===
wipeDatabaseKeepCollections();
