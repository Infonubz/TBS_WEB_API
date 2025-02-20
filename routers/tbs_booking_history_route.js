const express = require('express');
const tbsbookinghistory = express.Router();
const {tbsBookingHistory} = require('../controllers/tbs_booking_history_controller')

tbsbookinghistory.post('/tbsbookinghistory', tbsBookingHistory)

module.exports = {  tbsbookinghistory }