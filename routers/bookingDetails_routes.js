const express = require('express');
const { bookingDetails, Getbooking, putBookingDetails, putPrice, downloadticket } = require('../controllers/bookingDetails_controller');

const bookingRouter = express.Router();

bookingRouter.post('/booking_details', bookingDetails)
bookingRouter.get('/booking_details/:mobile_number', Getbooking)
bookingRouter.put('/booking-details/:id', putBookingDetails)
bookingRouter.put('/update-price/:id', putPrice)
bookingRouter.get('/download_booked_ticket/:Booking_Id', downloadticket)

module.exports = { bookingRouter }