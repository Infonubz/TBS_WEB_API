const express = require('express')
const { getTicketView, ticketcancel, getAllTicket, UpcomingJourney, CompletedJourney, CancelledJourney, getTicketViewForCancellation } = require('../controllers/ticket_view_controller')

ticketRouter = express.Router()

ticketRouter.post('/ticket-views', getTicketView)
ticketRouter.post('/cancel-ticket-view', getTicketViewForCancellation)
ticketRouter.post('/cancel-ticket', ticketcancel)
ticketRouter.get('/Tickets/:status_id', getAllTicket)
ticketRouter.post('/upcoming', UpcomingJourney)
ticketRouter.post('/completed', CompletedJourney)
ticketRouter.post('/cancelled', CancelledJourney)

module.exports = { ticketRouter }