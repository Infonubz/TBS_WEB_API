const express = require("express");
const tbsbookinghistory = express.Router();
const {
  tbsBookingHistory,
  getJouneryDetails,
  ticketcancellation,
  getcancelledticketbyid,
  downloadticketbyid,
  getTicketBookingHistoryById,
  getDiscountOffer,
  discountOfferValid
} = require("../controllers/tbs_booking_history_controller");

tbsbookinghistory.post("/tbsbookinghistory", tbsBookingHistory);
tbsbookinghistory.post("/journey/:no", getJouneryDetails);
tbsbookinghistory.post("/cancellation", ticketcancellation);
tbsbookinghistory.post("/getcancelledticket", getcancelledticketbyid);
tbsbookinghistory.get("/downloadticket/:id", downloadticketbyid);
tbsbookinghistory.get("/getbookingdetails/:ticket_no",getTicketBookingHistoryById);
tbsbookinghistory.post("/getdiscountoffers", getDiscountOffer);
tbsbookinghistory.post("/offervalid", discountOfferValid)

module.exports = { tbsbookinghistory };

