const express = require('express')
const { postInquiry } = require('../controllers/inquiry_support');
const { authenticateToken } = require('../middileware/Auth');


const inquiryRouter = express.Router();

inquiryRouter.post('/send-inquiry', authenticateToken, postInquiry);

module.exports = { inquiryRouter }