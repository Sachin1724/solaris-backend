// routes/dataRoutes.js
const express = require("express");
const { getAllData } = require("../controllers/dataController");
const router = express.Router();

router.route("/").get(getAllData);

module.exports = router;