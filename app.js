const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/messaging_app', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.log('MongoDB connection error:', err));

// Auth Middleware (example - adjust based on your auth system)
// This middleware should set req.user or req.userId
app.use((req, res, next) => {
  // Example: Get user ID from headers, JWT token, or session
  // For testing, you should pass userId in headers: X-User-Id
  req.user = {
    _id: req.headers['x-user-id'] || req.userId
  };
  next();
});

// Routes
const messageRouter = require('./routes/messageRouter');
app.use('/api/messages', messageRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong',
    error: err.message
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
