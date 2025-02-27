const express = require('express');
const { getFeedback, getFeedbackById, postFeedback, getFeedbackByRating, deleteFeedback, feedbackAverage } = require('../controllers/feeback_controller');

const feedbackRouter = express.Router()

feedbackRouter.get('/feedback', getFeedback);
feedbackRouter.get('/feedback/:tbs_fb_id', getFeedbackById);
feedbackRouter.post('/feedback', postFeedback);
feedbackRouter.post('/feedback-By-Rating', getFeedbackByRating)
feedbackRouter.delete('/feedback/:tbs_fb_id', deleteFeedback)
feedbackRouter.get('/feedbackCount', feedbackAverage)

module.exports = { feedbackRouter }