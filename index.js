
const express = require('express');
const jwt = require("jsonwebtoken");
const cors = require('cors');
const bcrypt = require("bcryptjs");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();

const corsConfig = { origin: "https://themerlingroupworld.com", credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }
app.use(cors(corsConfig));
app.use(express.json());


const port = process.env.PORT || 5001;



let client;
let usersCollection;

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
    console.log("✅ Connected to MongoDB!");
  }
}

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

// Root route
app.get('/', (req, res) => {
  res.send('Server is running!');
});

// JWT generate
app.post('/jwt', async (req, res) => {
  await connectToDB();
  const user = req.body;
  const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: '5h'
  });
  res.send({ token });
});

// Get all users
app.get('/users', async (req, res) => {
  await connectToDB();
  const result = await usersCollection.find().toArray();
  res.send(result);
});

// User register
app.post('/users', async (req, res) => {
  await connectToDB();
  const { name, email, password } = req.body;

  const existingUser = await usersCollection.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: 'User already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = { name, email, password: hashedPassword };
  const result = await usersCollection.insertOne(newUser);

  const token = jwt.sign(
    { id: result.insertedId, email },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: '5h' }
  );

  res.status(201).json({ message: 'Signup successful', token });
});

// User login
app.post('/signin', async (req, res) => {
  await connectToDB();
  const { email, password } = req.body;

  const user = await usersCollection.findOne({ email });
  if (!user) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  const isPasswordCorrect = await bcrypt.compare(password, user.password);
  if (!isPasswordCorrect) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user._id, email: user.email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '5h' });

  res.status(200).json({ message: 'Login successful', token });
});

// Protected dashboard
app.get('/dashboard', verifyToken, (req, res) => {
  res.json({
    message: 'Welcome to your dashboard!',
    user: req.user
  });
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});

module.exports = app;
