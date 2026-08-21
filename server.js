require("dotenv").config();
const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");
const adminRoutes = require("./routes/adminRoutes");
const studentRoutes = require("./routes/studentRoutes");

const app = express();

connectDB();

app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use("/api/admin", adminRoutes);
app.use("/api/student", studentRoutes);

// Simple health check so you can confirm the backend is reachable once
// deployed on its own host, separate from the frontend.
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
