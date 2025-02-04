const express = require('express');
const { getBusDetails } = require('../controllers/card_details_controller');

const cardRouter = express.Router();


cardRouter.post('/bus-details', getBusDetails);

module.exports = { cardRouter } 
