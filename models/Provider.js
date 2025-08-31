const { ObjectId } = require('mongodb');

const ProviderSchema = {
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  specialization: { type: String },
  slots: [
    {
      _id: false,
      date: String,        // "2025-09-01"
      time: String,        // "10:00 AM"
      booked: { type: Boolean, default: false },
      userId: { type: String, default: null }
    }
  ]
};

module.exports = ProviderSchema;
