const express = require('express');
const anuBusrouter = express.Router();
const { route } = require('../controllers/anuBusCntroller');
const { Filtersin, countBoardingDropping } = require('../controllers/filterIntegration');

anuBusrouter.post('/process-bus-info', route)
//anuBusrouter.post('/filters', Filters)
anuBusrouter.post('/filters-In', Filtersin)
anuBusrouter.post('/count-board-drop', countBoardingDropping)


module.exports = { anuBusrouter }
