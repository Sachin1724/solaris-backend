// routes/dataRoutes.js
const express = require("express");
const { getAllData, getLatestData } = require("../controllers/dataController");
const router = express.Router();

router.route("/").get(getAllData);
router.route("/latest").get(getLatestData);

module.exports = router;