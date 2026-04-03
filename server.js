import express from "express";
import cors from "cors";
import pkg from "pg";
import multer from "multer";
import cloudinary from "cloudinary";
import dotenv from "dotenv";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

// ✅ DB Connection
const pool = new Pool({
  connectionString: process.env.DB_URL,
});

// ✅ Cloudinary Config (FIXED)
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ✅ Multer setup
const upload = multer({ dest: "uploads/" });

// ✅ Health route (important for Render)
app.get("/", (req, res) => {
  res.send("Server is live 🚀");
});

// ✅ Add Property
app.post("/api/properties", async (req, res) => {
  try {
    const data = req.body;

    const result = await pool.query(
      `INSERT INTO properties 
      (title, location, type, bhk, area, plot, price, pricePerSqft, status, listingType, images, projectName)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        data.title,
        data.location,
        data.type,
        data.bhk,
        data.area,
        data.plot,
        data.price,
        data.pricePerSqft,
        data.status || "pending",
        data.listingType,
        JSON.stringify(data.images || []),
        data.projectName || ""
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving property");
  }
});

// ✅ Get Properties
app.get("/api/properties", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM properties ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching properties");
  }
});

// ✅ Image Upload
app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    const result = await cloudinary.v2.uploader.upload(req.file.path);
    res.json({ url: result.secure_url });
  } catch (err) {
    console.error(err);
    res.status(500).send("Upload failed");
  }
});

// ✅ PORT FIX (MOST IMPORTANT)
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});
