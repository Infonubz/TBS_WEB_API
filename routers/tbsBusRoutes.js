const express = require('express');
const tbsBusRoter = express.Router();
const { route } = require('../controllers/tbsBusCntroller');
const { Filtersin, countBoardingDropping } = require('../controllers/filterIntegration');

tbsBusRoter.post('/process-bus-info', route)
//tbsBusRoter.post('/filters', Filters)
tbsBusRoter.post('/filters-In', Filtersin)
tbsBusRoter.post('/count-board-drop', countBoardingDropping)


module.exports = { tbsBusRoter }
