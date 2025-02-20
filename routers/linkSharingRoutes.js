const express = require('express')
const { ShareAppLink } = require('../controllers/linkSharingController')

const linkRouter = express.Router()

linkRouter.post('/share-link', ShareAppLink)

module.exports = { linkRouter }