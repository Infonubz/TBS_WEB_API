const { getRoute } = require("../controllers/travel_related_policies")

const express = require('express')

const travelRoute = express.Router()

travelRoute.get('/travel-policy', getRoute)

module.exports = { travelRoute }