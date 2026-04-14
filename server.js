{
  "name": "proppe-backend",
  "version": "2.0.0",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "pg": "^8.11.0",
    "multer": "^1.4.5-lts.1",
    "cloudinary": "^1.37.0",
    "dotenv": "^16.0.3",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5"
  }
}
