const express = require('express');
const {searchGetstations} = require('../controllers/abiBusController')

const abiBus = express.Router();

abiBus.get('/getStation/:station_name', searchGetstations)


module.exports = { abiBus }