const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const playerRoutes = require('./routes/players');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI ||
  'mongodb+srv://kk2141998_db_user:ekwY7erxQeute8JI@dinooverkill.tmr9ioy.mongodb.net/dinooverkill?appName=DinoOverkill';

app.use(cors());
app.use(express.json());

// Serve static files (index.html, game.js, style.css, images)
app.use(express.static(path.join(__dirname)));

// Cache MongoDB connection for serverless (Vercel reuses containers)
let isConnected = false;
async function connectDB() {
  if (isConnected) return;
  await mongoose.connect(MONGO_URI);
  isConnected = true;
  console.log('Connected to MongoDB Atlas');
}

// Ensure DB is connected before any API request
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// API routes
app.use('/api/players', playerRoutes);

// Local development: listen on port
if (process.env.NODE_ENV !== 'production') {
  connectDB().then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
  }).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
}

module.exports = app;
