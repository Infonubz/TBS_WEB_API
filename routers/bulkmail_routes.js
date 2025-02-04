const express = require('express')
const { getPassengerMail } = require('../controllers/bulkmail_controller')

const bulkmailRouter = express.Router()

bulkmailRouter.get('/passenger-email', getPassengerMail)

module.exports = { bulkmailRouter }