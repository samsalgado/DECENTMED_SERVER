const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

let db;
async function initDB(client) { db = client.db('decentMeds'); }

// Book an appointment
router.post('/', async (req, res) => {
  const { providerId, userId, userName, userEmail, date, time } = req.body;
  try {
    // check slot availability
    const provider = await db.collection('providers').findOne({ _id: new ObjectId(providerId) });
    const slotIndex = provider.slots.findIndex(s => s.date === date && s.time === time);
    if (slotIndex === -1) return res.status(400).json({ message: "Slot not found" });
    if (provider.slots[slotIndex].booked) return res.status(400).json({ message: "Slot already booked" });

    // mark slot as booked
    provider.slots[slotIndex].booked = true;
    provider.slots[slotIndex].userId = userId;
    await db.collection('providers').updateOne(
      { _id: new ObjectId(providerId) },
      { $set: { slots: provider.slots } }
    );

    // create booking record
    const booking = { providerId, userId, userName, userEmail, date, time, createdAt: new Date() };
    await db.collection('bookings').insertOne(booking);

    res.status(201).json({ message: 'Appointment booked', booking });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get all bookings for a provider
router.get('/:providerId', async (req, res) => {
  const { providerId } = req.params;
  try {
    const bookings = await db.collection('bookings').find({ providerId }).toArray();
    res.json(bookings);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = { router, initDB };
