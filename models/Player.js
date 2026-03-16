const mongoose = require('mongoose');

const scoreEntrySchema = new mongoose.Schema({
  score: { type: Number, required: true },
  date:  { type: String, required: true }
}, { _id: false });

const playerSchema = new mongoose.Schema({
  username:  { type: String, required: true, unique: true, lowercase: true, trim: true },
  wallet:    { type: String, required: true, lowercase: true, trim: true, index: true },
  bestScore: { type: Number, default: 0 },
  scores:    { type: [scoreEntrySchema], default: [] }
}, { timestamps: true });

playerSchema.index({ bestScore: -1 });

module.exports = mongoose.model('Player', playerSchema);
