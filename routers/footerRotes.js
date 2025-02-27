const express = require('express');
const { GetAllFooter } = require('../controllers/footerController');


const footrouter = express.Router();

footrouter.get('/footer', GetAllFooter)

module.exports = { footrouter }