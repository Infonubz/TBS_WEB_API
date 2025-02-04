const express = require('express')
const { postInquiry } = require('../controllers/inquiry_support')


const inquiryRouter = express.Router()

inquiryRouter.post('/send-inquiry', postInquiry);

module.exports = { inquiryRouter }