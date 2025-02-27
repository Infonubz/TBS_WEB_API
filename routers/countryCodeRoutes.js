const express = require('express')
const { CountryCode } = require('../controllers/countryCodeController')

const countryRouter = express.Router()

countryRouter.get('/country-codes', CountryCode)

module.exports = { countryRouter }