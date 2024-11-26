require('dotenv').config();
const express = require('express');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const cors = require('cors');
const cookieParser = require("cookie-parser");
const app = express();
// deploy
// middleware
app.use(cors({ origin: "http://localhost:3000", credentials: true })); // Adjust for frontend URL
app.use(express())
app.use(express.json());
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static("public"));
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5001; // Choose a port for your server

const crypto = require("crypto");
const secret = crypto.randomBytes(64).toString("hex");
console.log("JWT Secret:", secret);
const SECRET_KEY = process.env.SECRET_KEY;

// mongoDb dataBase setUp***
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wrgil.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const usersCollection = client.db('decentMeds').collection('users')
    const paymentCollection = client.db('decentMeds').collection('paymentUser')


    // JWT post
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '5h' })
      res.send({ token })
    })


    app.get('/', async (req, res) => {
      res.send('hello server is running')
    })


    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result)
    })

    app.get('/payments-history', async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result)
    })


    app.get('/payments', async (req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result)
    })


    // user related apis
    app.get('/api/register', async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    // users data insert before code hide now
    app.post('/users', async (req, res) => {
      const { name, email, password, role } = req.body;
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
      const totalUsers = { name, email, password: hashedPassword, role };
      console.log(totalUsers, 20222);
      const query = { email: totalUsers?.email }
      const existingUser = await usersCollection.findOne(query)
      if (existingUser) {

        return res.send({ message: 'user already exist' })
      }

      const result = await usersCollection.insertOne(totalUsers);
      res.send(result);
      console.log(result);
    })



    // Stripe payment gateway

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;

      const amount = Math.round(price * 100);
      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card'],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,

      });
    });

    // payment database 
    app.post('/payments', async (req, res) => {
      const paymentDetails = req.body;

      // It is function already onetime payment successful but try second time pay then show already payment done
      // const query = {
      //   $and: [
      //     { email: paymentDetails.email},
      //     { bitcoinAddress: paymentDetails.bitcoinAddress },
      //     { transaction: paymentDetails.transaction },
      //   ],
      // };

      // const existPayment = await paymentCollection.findOne({email:paymentDetails.email});
      // if (existPayment) {
      //   console.log('exist payment');
      //   return res.send({ message: 'Already Payment Successful' })
      // }
      const paymentResult = await paymentCollection.insertOne(paymentDetails);
      console.log(paymentResult);
      res.send(paymentResult)
    })

    // Admin approved valid bitcoin transaction:
    app.patch('/payments-history/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const status = req.query.status;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: status,
        }
      };
      const result = await paymentCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();

  }

}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});


