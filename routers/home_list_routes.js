const express = require('express');
const { createHomeListEntry, postHomeList, getHomeList } = require('../controllers/home_list_controller');


const homeListRouter = express.Router()

homeListRouter.post('/homeList', createHomeListEntry);
homeListRouter.post('/homeListPost', postHomeList);
homeListRouter.get('/homeList', getHomeList);

module.exports = { homeListRouter }