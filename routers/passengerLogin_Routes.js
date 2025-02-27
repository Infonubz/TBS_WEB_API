const express = require('express');
const { PassengerLogin, VerifyOTP } = require('../controllers/passengerLogin_controller');

const paxLogRouter = express.Router()

paxLogRouter.post('/send-request', PassengerLogin)
paxLogRouter.post('/verify-otp', VerifyOTP)

module.exports = { paxLogRouter }