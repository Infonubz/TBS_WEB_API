const express = require('express')
const { getAllstates, getStatesByNameOrCode } = require('../controllers/state_code_controller')

const stateRouter = express.Router()

stateRouter.get('/state-district', getAllstates)
stateRouter.get('/state-district/:search', getStatesByNameOrCode)

module.exports = { stateRouter }