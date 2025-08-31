const BookingSchema = {
  providerId: { type: String, required: true },
  userId: { type: String, required: true },
  userName: String,
  userEmail: String,
  date: String,
  time: String,
  createdAt: { type: Date, default: new Date() }
};

module.exports = BookingSchema;
