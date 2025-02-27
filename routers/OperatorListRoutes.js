const express = require('express') 
const { operatorNameList, operatorSearch } = require('../controllers/operator_listController')

const opRouter = express.Router()

opRouter.get('/operator-name', operatorNameList)
opRouter.post('/operator-names/:letter?', operatorSearch)

module.exports = { opRouter }