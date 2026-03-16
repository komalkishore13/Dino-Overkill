const express = require('express');
const router = express.Router();
const Player = require('../models/Player');

// GET /api/players/leaderboard — Top 10 by bestScore
router.get('/leaderboard', async (req, res) => {
  try {
    const players = await Player.find({}, 'username wallet bestScore')
      .sort({ bestScore: -1 })
      .limit(10)
      .lean();
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// GET /api/players/wallet/:wallet — Find player(s) by wallet
router.get('/wallet/:wallet', async (req, res) => {
  try {
    const wallet = req.params.wallet.toLowerCase();
    const players = await Player.find({ wallet }, 'username wallet bestScore scores').lean();
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch players for wallet' });
  }
});

// GET /api/players/check/:username — Check if username is taken
router.get('/check/:username', async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const exists = await Player.exists({ username });
    res.json({ taken: !!exists });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check username' });
  }
});

// POST /api/players — Create new player
router.post('/', async (req, res) => {
  try {
    const { username, wallet } = req.body;
    const player = await Player.create({
      username: username.toLowerCase(),
      wallet: wallet.toLowerCase(),
      bestScore: 0,
      scores: []
    });
    res.status(201).json(player);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    res.status(500).json({ error: 'Failed to create player' });
  }
});

// GET /api/players/:username — Get single player
router.get('/:username', async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const player = await Player.findOne({ username }).lean();
    if (!player) return res.status(404).json({ error: 'Player not found' });
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch player' });
  }
});

// POST /api/players/:username/score — Add score + update bestScore
router.post('/:username/score', async (req, res) => {
  try {
    const username = req.params.username.toLowerCase();
    const { score } = req.body;
    const date = new Date().toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric'
    });

    const player = await Player.findOne({ username });
    if (!player) return res.status(404).json({ error: 'Player not found' });

    player.scores.push({ score, date });
    player.scores.sort((a, b) => b.score - a.score);
    player.scores = player.scores.slice(0, 20);

    if (score > player.bestScore) {
      player.bestScore = score;
    }

    await player.save();
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save score' });
  }
});

module.exports = router;
