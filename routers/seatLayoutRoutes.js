const express = require('express')
const { getSeatLayout, getSeatLayoutById, updateSeatStatus } = require('../controllers/seatLayoutController')

const seatRouter = express.Router()

seatRouter.get('/seatLayouts', getSeatLayout)
seatRouter.post('/seatLayout-ById', getSeatLayoutById)
seatRouter.put('/update-seat-status', updateSeatStatus)

module.exports = { seatRouter }