var express = require("express");
var router = express.Router();
let messageModel = require("../schemas/messages");
let userModel = require("../schemas/users");
let { CheckLogin } = require('../utils/authHandler');
let fs = require('fs');
let path = require('path');

// Test route
router.get("/test", async function (req, res, next) {
  res.send({ message: "Messages route is working" });
});

// GET test users
router.get("/test-users", async function (req, res, next) {
  try {
    let users = await userModel.find({ isDeleted: false }).select('_id username email').limit(10);
    res.send(users);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// GET /:userId - Lấy message cuối cùng của mỗi user
router.get("/:userId", async function (req, res, next) {
  try {
    let currentUser = req.params.userId;
    
    // Lấy tất cả conversation partners
    let sent = await messageModel.find({ from: currentUser, isDeleted: false }).select('to').distinct('to');
    let received = await messageModel.find({ to: currentUser, isDeleted: false }).select('from').distinct('from');
    
    // Merge array và remove duplicates
    let partners = [...new Set([...sent, ...received])];
    
    // Lấy message cuối cùng của mỗi partner
    let lastMessages = [];
    for (let partnerId of partners) {
      let lastMsg = await messageModel.find({
        $or: [
          { from: currentUser, to: partnerId },
          { from: partnerId, to: currentUser }
        ],
        isDeleted: false
      })
        .populate('from', 'username email')
        .populate('to', 'username email')
        .sort({ createdAt: -1 })
        .limit(1);
      
      if (lastMsg.length > 0) {
        lastMessages.push(lastMsg[0]);
      }
    }
    
    lastMessages.sort((a, b) => b.createdAt - a.createdAt);
    res.send(lastMessages);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// GET /:userID/:fromUserId - Lấy toàn bộ message giữa 2 user
router.get("/:userID/:fromUserId", async function (req, res, next) {
  try {
    let currentUserId = req.params.fromUserId;
    let otherUserId = req.params.userID;
    
    let messages = await messageModel.find({
      $or: [
        { from: currentUserId, to: otherUserId },
        { from: otherUserId, to: currentUserId }
      ],
      isDeleted: false
    })
      .populate('from', 'username email')
      .populate('to', 'username email')
      .sort({ createdAt: 1 });
    
    res.send(messages);
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// POST / - Gửi message
router.post("/", async function (req, res, next) {
  try {
    let { from, to, type, text, filePath } = req.body;
    
    // Validate
    if (!from) {
      return res.status(400).send({ message: "From user ID is required" });
    }
    
    if (!to) {
      return res.status(400).send({ message: "To user ID is required" });
    }
    
    if (!type || !['file', 'text'].includes(type)) {
      return res.status(400).send({ message: "Type must be 'file' or 'text'" });
    }
    
    if (!text) {
      return res.status(400).send({ message: "Text content is required" });
    }
    
    let messageContent = {
      type: type,
      text: text
    };
    
    let newMessage = await messageModel.create({
      from: from,
      to: to,
      messageContent: messageContent
    });
    
    let result = await messageModel.findById(newMessage._id).populate('from', 'username email').populate('to', 'username email');
    
    res.status(201).send({
      message: "Message sent successfully",
      data: result
    });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

// DELETE /:messageID - Xóa message (soft delete)
router.delete("/:messageID", async function (req, res, next) {
  try {
    let messageId = req.params.messageID;
    
    let deletedMsg = await messageModel.findByIdAndUpdate(
      messageId,
      { isDeleted: true },
      { new: true }
    );
    
    if (!deletedMsg) {
      return res.status(404).send({ message: "Message not found" });
    }
    
    res.send({ message: "Message deleted successfully", data: deletedMsg });
  } catch (error) {
    res.status(400).send({ message: error.message });
  }
});

module.exports = router;
