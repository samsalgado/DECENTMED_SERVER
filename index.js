// ================== BASE IMPORTS (EXISTING) ==================
const express = require('express');
const jwt = require("jsonwebtoken");
const cors = require('cors');
const bcrypt = require("bcryptjs");
const nodemailer = require('nodemailer');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const { OAuth2Client } = require('google-auth-library');

const app = express();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
app.use(cors({
  origin: [
    "http://localhost:3000",
    "https://decentmed.org",
    "https://www.decentmed.org"
  ],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  credentials: true
}));


// ================== DATABASE ==================
let client;
let usersCollection;
let paymentsCollection;
let providersCollection;      // NEW: Providers collection
let bookingsCollection;       // NEW: Bookings collection



async function connectToDB() {
  if (!client) {
    const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@decentmedfreecluster.aozphr5.mongodb.net/?retryWrites=true&w=majority&appName=DecentMedFreeCluster`;
    client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      }
    });


    await client.connect();
    usersCollection = client.db('decentMeds').collection('users');
    paymentsCollection = client.db('decentMeds').collection('payments');
    providersCollection = client.db('decentMeds').collection('providers');    // NEW
    bookingsCollection = client.db('decentMeds').collection('bookings');      // NEW
    console.log("✅ Connected to MongoDB!");
  }
}


// ================== MIDDLEWARE ==================
// const corsConfig = { origin: "http://localhost:3000", credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] };

app.use(express.json());


const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

// ================== ROOT ROUTE ==================
app.get('/', (req, res) => { res.send('Server is running!'); });

// ================== JWT ==================
app.post('/jwt', async (req, res) => {
  await connectToDB();
  const user = req.body;
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });
  res.send({ token });
});

// ================== USERS ==================
app.get('/users', verifyToken, async (req, res) => {
  await connectToDB();
  const users = await usersCollection.find().toArray();
  res.json(users);
});
// ================== SIGNUP (CREATE USER) ==================
app.post("/users", async (req, res) => {
  try {
    await connectToDB();
    const { name, email, password, role, code } = req.body;

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const existingUser = await usersCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      name,
      email,
      password: hashedPassword,
      role,
      code: code || null,
      createdAt: new Date()
    };

    const result = await usersCollection.insertOne(newUser);

    const token = jwt.sign(
      { id: result.insertedId, email, role },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({
      token,
      message: "User created successfully"
    });

  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Server error during signup" });
  }
});



// ================== USER PROFILE ROUTE ==================
app.get('/me', verifyToken, async (req, res) => {
  await connectToDB();
  const user = await usersCollection.findOne(
    { email: req.user.email },
    { projection: { password: 0 } } // password hide
  );
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});




app.post('/signin', async (req, res) => {
  await connectToDB();
  const { email, password } = req.body;
  const user = await usersCollection.findOne({ email });
  if (!user) return res.status(400).json({ message: "Invalid credentials" });
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return res.status(400).json({ message: "Invalid credentials" });
  const token = jwt.sign({ id: user._id, email: user.email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });
  res.json({ message: "Login successful", token });
});

app.post('/google-signup', async (req, res) => {
  await connectToDB();
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ message: "No credential provided" });
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { email, name } = payload;
    let user = await usersCollection.findOne({ email });
    if (!user) {
      const result = await usersCollection.insertOne({ name, email, password: "" });
      user = { _id: result.insertedId, name, email };
    }
    const token = jwt.sign({ id: user._id, email: user.email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7h' });
    res.json({ message: "Google signup/login successful", token });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Google signup failed" });
  }
});

// ================== PAYMENTS ==================

app.post('/create-payment-intent', verifyToken, async (req, res) => {
  await connectToDB();
  const { price } = req.body;
  if (!price || price <= 0) return res.status(400).json({ message: "Invalid price" });
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      // amount: Math.round(price * 100),
      amount: price,   // 🔹 Already cents, don't multiply
      currency: 'usd',
      payment_method_types: ['card']
    });
    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Stripe payment intent failed" });
  }
});

app.post('/payments', verifyToken, async (req, res) => {
  await connectToDB();
  const payment = req.body;
  const result = await paymentsCollection.insertOne(payment);
  res.json(result);
});


// ================== CONTACT EMAIL ==================
app.post('/send-email', async (req, res) => {
  const { name, email, phone } = req.body;
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
  const mailOptions = { from: `"Contact Form" <${process.env.EMAIL_USER}>`, to: 'samueljuansalgado@gmail.com', subject: 'New Contact Request from', text: `Name:${name}\nEmail:${email}\nPhone:${phone}` };
  try {
    await transporter.sendMail(mailOptions);
    res.json({ message: "Email sent successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Email failed to send" });
  }
});

// ================== NEW CODE START: PROVIDER & BOOKING SYSTEM ==================

// ---- Add a new provider (admin only) ----
app.post('/api/providers', verifyToken, async (req, res) => {
  await connectToDB();
  const { name, specialization } = req.body;
  const newProvider = { name, specialization, slots: [] };
  const result = await providersCollection.insertOne(newProvider);
  res.json({ message: "Provider added", result });
});

// ---- Get all providers ----
app.get('/api/providers', async (req, res) => {
  await connectToDB();
  const providers = await providersCollection.find().toArray();
  res.json(providers);
});

// ---- Get provider slots ----
app.get('/api/providers/:id/slots', async (req, res) => {
  await connectToDB();
  const { id } = req.params;
  const provider = await providersCollection.findOne({ _id: new ObjectId(id) });
  res.json(provider?.slots || []);
});

// ---- Add slots to provider ----
app.post('/api/providers/:id/slots', verifyToken, async (req, res) => {
  await connectToDB();
  const { id } = req.params;
  const { slots } = req.body; // [{date,time,booked:false}]
  const provider = await providersCollection.findOne({ _id: new ObjectId(id) });
  if (!provider) return res.status(404).json({ message: "Provider not found" });
  const updatedSlots = [...(provider.slots || []), ...slots];
  await providersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { slots: updatedSlots } });
  res.json({ message: "Slots added" });
});

// ---- Book an appointment ----
app.post('/api/bookings', verifyToken, async (req, res) => {
  await connectToDB();
  const { providerId, date, time, userName, userEmail } = req.body;
  const provider = await providersCollection.findOne({ _id: new ObjectId(providerId) });
  if (!provider) return res.status(404).json({ message: "Provider not found" });
  const slotIndex = provider.slots.findIndex(s => s.date === date && s.time === time && !s.booked);
  if (slotIndex === -1) return res.status(400).json({ message: "Slot not available" });
  provider.slots[slotIndex].booked = true;
  await providersCollection.updateOne({ _id: new ObjectId(providerId) }, { $set: { slots: provider.slots } });
  const booking = { providerId, date, time, userName, userEmail };
  const result = await bookingsCollection.insertOne(booking);
  res.json({ message: "Booking successful", result });
});

// ---- Get bookings by provider ----
app.get('/api/bookings/:providerId', verifyToken, async (req, res) => {
  await connectToDB();
  const { providerId } = req.params;
  const bookings = await bookingsCollection.find({ providerId }).toArray();
  res.json(bookings);
});

// ---- Admin: get all bookings ----
app.get('/api/admin/bookings', verifyToken, async (req, res) => {
  await connectToDB();
  const bookings = await bookingsCollection.find().toArray();
  res.json(bookings);
});

// ---- Admin: get all providers ----
app.get('/api/admin/providers', verifyToken, async (req, res) => {
  await connectToDB();
  const providers = await providersCollection.find().toArray();
  res.json(providers);
});

// ---- Admin: update provider slots ----
app.patch('/api/admin/providers/:id/slots', verifyToken, async (req, res) => {
  await connectToDB();
  const { id } = req.params;
  const { slots } = req.body;
  await providersCollection.updateOne({ _id: new ObjectId(id) }, { $set: { slots } });
  res.json({ message: "Slots updated" });
});

// ================== NEW CODE END ==================

app.listen(process.env.PORT || 5000, () => console.log(`🚀 Server running on port ${process.env.PORT || 5000}`));
module.exports = app;
