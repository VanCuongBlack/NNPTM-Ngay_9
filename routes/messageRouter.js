const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Message = require('../models/Message');
const User = require('../models/User');

// Middleware to get current user (assume user info is in req.user from auth middleware)
const getCurrentUserId = (req) => {
  // This should be set by authentication middleware
  return req.user ? req.user._id : req.userId;
};

/**
 * GET /:userID
 * Get all messages between current user and specified userID (both directions)
 */
router.get('/:userID', async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);
    const targetUserId = req.params.userID;

    // Check if userID is valid
    if (!currentUserId || !targetUserId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current user ID or target user ID is missing' 
      });
    }

    // Find all messages where:
    // 1. from current user to target user
    // 2. from target user to current user
    const messages = await Message.find({
      $or: [
        { 
          from: currentUserId, 
          to: targetUserId 
        },
        { 
          from: targetUserId, 
          to: currentUserId 
        }
      ]
    })
      .populate('from', 'name email') // Populate sender info
      .populate('to', 'name email')   // Populate receiver info
      .sort({ createdAt: 1 }); // Sort by oldest first

    return res.status(200).json({
      success: true,
      data: messages,
      count: messages.length
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving messages',
      error: error.message
    });
  }
});

/**
 * POST /
 * Create a new message
 * Body:
 * {
 *   to: "userID",
 *   type: "file" | "text",
 *   text: "file path or message content"
 * }
 */
router.post('/', async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);
    const { to, type, text } = req.body;

    // Validation
    if (!currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Current user ID is missing'
      });
    }

    if (!to) {
      return res.status(400).json({
        success: false,
        message: 'Recipient user ID (to) is required'
      });
    }

    if (!type || !['file', 'text'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be either "file" or "text"'
      });
    }

    if (!text) {
      return res.status(400).json({
        success: false,
        message: 'Text content is required (file path or message text)'
      });
    }

    // Create new message
    const newMessage = new Message({
      from: currentUserId,
      to: to,
      messageContent: {
        type: type,
        text: text
      }
    });

    // Save to database
    const savedMessage = await newMessage.save();

    // Populate user info
    const populatedMessage = await Message.findById(savedMessage._id)
      .populate('from', 'name email')
      .populate('to', 'name email');

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: populatedMessage
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error creating message',
      error: error.message
    });
  }
});

/**
 * GET /
 * Get the last message from each user that the current user has corresponded with
 * Returns conversations (last message for each user)
 */
router.get('/', async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);

    if (!currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Current user ID is missing'
      });
    }

    // Convert to ObjectId
    const currentUserObjectId = new mongoose.Types.ObjectId(currentUserId);

    // Find all unique users that current user has messaged or been messaged by
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { from: currentUserObjectId },
            { to: currentUserObjectId }
          ]
        }
      },
      {
        // Add a field for the other user (if current user is sender, other user is receiver, vice versa)
        $addFields: {
          otherUser: {
            $cond: [
              { $eq: ['$from', currentUserObjectId] },
              '$to',
              '$from'
            ]
          }
        }
      },
      {
        // Sort by date descending to get latest messages first
        $sort: { createdAt: -1 }
      },
      {
        // Group by otherUser and get the first (latest) message for each
        $group: {
          _id: '$otherUser',
          lastMessage: { $first: '$$ROOT' }
        }
      },
      {
        // Sort final results by message creation date (newest first)
        $sort: { 'lastMessage.createdAt': -1 }
      },
      {
        // Lookup to populate user info
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'userInfo'
        }
      }
    ]);

    // Format response
    const formattedConversations = conversations.map(conv => ({
      userId: conv._id,
      userInfo: conv.userInfo[0] || null,
      lastMessage: {
        from: conv.lastMessage.from,
        to: conv.lastMessage.to,
        messageContent: conv.lastMessage.messageContent,
        createdAt: conv.lastMessage.createdAt,
        updatedAt: conv.lastMessage.updatedAt
      }
    }));

    return res.status(200).json({
      success: true,
      data: formattedConversations,
      count: formattedConversations.length
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving conversations',
      error: error.message
    });
  }
});

module.exports = router;
