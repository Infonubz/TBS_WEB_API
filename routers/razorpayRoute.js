const express = require('express');
const { razorPayOrder, orderValid } = require('../controllers/razorpayController')
const razorpay = express.Router();

razorpay.post('/order', razorPayOrder)
razorpay.post('/order/validate', orderValid)

module.exports = { razorpay }