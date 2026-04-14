import express from "express";
import cors from "cors";
import pkg from "pg";
import multer from "multer";
import cloudinary from "cloudinary";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "path";

dotenv.config();
const { Pool } = pkg;
const app = express();

app.use(helmet());

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:5173",
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS blocked"));
    }
  },
  credentials: true,
}));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, try after 15 minutes" },
});
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Upload limit reached" },
});
const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many submissions" },
});

app.use(generalLimiter);
app.use(express.json({ limit: "10kb" }));

const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
});

pool.connect((err) => {
  if (err) {
    console.error("DB Connection failed:", err.message);
  } else {
    console.log("✅ Database connected");
  }
});

cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only images allowed"), false);
  }
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

function sanitize(str) {
  if (!str) return "";
  return String(str)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function validateProperty(data) {
  const errors = [];
  if (!data.title || data.title.length < 3) errors.push("Title required");
  if (!data.location || data.location.length < 2) errors.push("Location required");
  if (!data.price || isNaN(data.price)) errors.push("Valid price required");
  return errors;
}

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Proppe API running 🚀" });
});

app.get("/api/properties", async (req, res) => {
  try {
    const { type, location, minPrice, maxPrice, listingType } = req.query;
    let query = "SELECT * FROM properties WHERE status = $1";
    let params = ["approved"];
    let idx = 2;

    if (type) { query += ` AND type = $${idx}`; params.push(sanitize(type)); idx++; }
    if (location) { query += ` AND location ILIKE $${idx}`; params.push(`%${sanitize(location)}%`); idx++; }
    if (minPrice) { query += ` AND price >= $${idx}`; params.push(Number(minPrice)); idx++; }
    if (maxPrice) { query += ` AND price <= $${idx}`; params.push(Number(maxPrice)); idx++; }
    if (listingType) { query += ` AND listingType = $${idx}`; params.push(sanitize(listingType)); idx++; }

    query += " ORDER BY created_at DESC LIMIT 50";
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("GET /api/properties error");
    res.status(500).json({ error: "Failed to fetch properties" });
  }
});

app.post("/api/properties", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const errors = validateProperty(req.body);
  if (errors.length > 0) return res.status(400).json({ errors });

  try {
    const data = req.body;
    const result = await pool.query(
      `INSERT INTO properties 
      (title, location, type, bhk, area, plot, price, 
       pricePerSqft, status, listingType, images, projectName)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id, title, location, price, status`,
      [
        sanitize(data.title), sanitize(data.location),
        sanitize(data.type), Number(data.bhk) || null,
        Number(data.area) || null, Number(data.plot) || null,
        Number(data.price), Number(data.pricePerSqft) || null,
        "pending", sanitize(data.listingType),
        JSON.stringify(data.images || []),
        sanitize(data.projectName || ""),
      ]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("POST /api/properties error");
    res.status(500).json({ error: "Failed to save property" });
  }
});

app.post("/api/upload", uploadLimiter, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });
    const result = await cloudinary.v2.uploader.upload(req.file.path, {
      folder: "proppe",
      transformation: [{ width: 1200, crop: "limit" }, { quality: "auto" }],
    });
    res.json({ success: true, url: result.secure_url });
  } catch (err) {
    console.error("Upload error");
    res.status(500).json({ error: "Upload failed" });
  }
});

app.post("/api/leads", leadLimiter, async (req, res) => {
  const { name, phone, propertyId } = req.body;
  if (!name || name.length < 2) return res.status(400).json({ error: "Valid name required" });
  if (!phone || !/^[6-9]\d{9}$/.test(phone)) return res.status(400).json({ error: "Valid Indian mobile required" });
  if (!propertyId || isNaN(propertyId)) return res.status(400).json({ error: "Valid property ID required" });

  try {
    await pool.query(
      "INSERT INTO leads (name, phone, property_id, created_at) VALUES ($1, $2, $3, NOW())",
      [sanitize(name), phone, Number(propertyId)]
    );
    res.json({ success: true, message: "Lead saved" });
  } catch (err) {
    console.error("Lead error");
    res.status(500).json({ error: "Failed to save lead" });
  }
});

app.use((err, req, res, next) => {
  console.error("Error:", err.message);
  res.status(500).json({ error: "Something went wrong" });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Proppe server running on port ${PORT}`);
});
