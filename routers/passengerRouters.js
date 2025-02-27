const express = require('express')
const { passengerPost, passengerPut, passengerDelete, passengerGetById, passengerGetAll, addpassengerPost, addpassengerPut, addpassengerDelete, addpassengerGetAll, addpassengerGetById, AllpassengerSGetById, passengerReferrelCodeGetById, getEmail, getEmailByID, SearchEmail } = require('../controllers/passengerController')

const { authenticateToken } = require('../middileware/Auth')

const passengerRouter = express.Router()

passengerRouter.post('/passenger-details', passengerPost)
passengerRouter.put('/passenger-details/:tbs_passenger_id', passengerPut)
passengerRouter.delete('/passenger-details/:tbs_passenger_id', passengerDelete)
passengerRouter.get('/passenger-details', passengerGetAll)
passengerRouter.get('/passenger-details/:tbs_passenger_id', passengerGetById)

passengerRouter.post('/add-passenger-details', authenticateToken,  addpassengerPost)
passengerRouter.put('/add-passenger-details/:tbs_add_pax_id', addpassengerPut)
passengerRouter.delete('/add-passenger-details/:tbs_add_pax_id', addpassengerDelete)
passengerRouter.get('/add-passenger-details', addpassengerGetAll)
passengerRouter.get('/add-passenger-details/:tbs_add_pax_id', addpassengerGetById)

passengerRouter.get('/all-passengers/:tbs_passenger_id', AllpassengerSGetById)

passengerRouter.get('/ReferralCode/:tbs_passenger_id', passengerReferrelCodeGetById)
passengerRouter.get('/get-All-Emailid', getEmail)
passengerRouter.get('/get-All-Emailid/:tbs_passenger_id', getEmailByID)
passengerRouter.get('/search-email', SearchEmail)


module.exports= { passengerRouter }
