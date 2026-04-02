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

const pool = new Pool({
  connectionString: process.env.DB_URL,
});

cloudinary.v2.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
});

const upload = multer({ dest: "uploads/" });

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
    res.status(500).send("Error saving property");
  }
});

app.get("/api/properties", async (req, res) => {
  const result = await pool.query("SELECT * FROM properties ORDER BY created_at DESC");
  res.json(result.rows);
});

app.post("/api/upload", upload.single("image"), async (req, res) => {
  try {
    const result = await cloudinary.v2.uploader.upload(req.file.path);
    res.json({ url: result.secure_url });
  } catch (err) {
    res.status(500).send("Upload failed");
  }
});

app.listen(5000, () => console.log("Server running 🚀"));