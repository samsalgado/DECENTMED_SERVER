const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

let db;
async function initDB(client) { db = client.db('decentMeds'); }

// Add Provider (admin)
router.post('/', async (req, res) => {
  const provider = req.body;
  try {
    const existing = await db.collection('providers').findOne({ email: provider.email });
    if (existing) return res.status(400).json({ message: "Provider already exists" });
    const result = await db.collection('providers').insertOne(provider);
    res.status(201).json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get all providers
router.get('/', async (req, res) => {
  try {
    const providers = await db.collection('providers').find().toArray();
    res.json(providers);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Add slots for a provider
router.post('/:providerId/slots', async (req, res) => {
  const { providerId } = req.params;
  const { slots } = req.body; // array of {date, time}
  try {
    const result = await db.collection('providers').updateOne(
      { _id: new ObjectId(providerId) },
      { $push: { slots: { $each: slots } } }
    );
    res.json(result);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get slots for provider
router.get('/:providerId/slots', async (req, res) => {
  const { providerId } = req.params;
  try {
    const provider = await db.collection('providers').findOne({ _id: new ObjectId(providerId) });
    res.json(provider.slots || []);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = { router, initDB };
