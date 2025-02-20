const express = require('express')
const { countBoardingDropping, searchBoardingDropping } = require('../controllers/count_search_controller')


const countRouter = express.Router()

countRouter.post('/count-board-drop', countBoardingDropping)
countRouter.post('/search-board-drop', searchBoardingDropping)

module.exports = { countRouter }
