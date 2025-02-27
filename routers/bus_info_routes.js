const express = require('express');
const { mainFunc } = require('../controllers/bus_info_controller');

const busInfoRouter = express.Router();

busInfoRouter.get('/lowprice', mainFunc);

module.exports = { busInfoRouter };
