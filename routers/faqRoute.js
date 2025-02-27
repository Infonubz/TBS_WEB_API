const express = require('express');
const { getFaq, getFaqByid, updateFqs, createfaqs, deleteApi, getAllFaq } = require('../controllers/faqController');

const faqrouter = express.Router();

faqrouter.put('/faq/:tbs_faq_id', updateFqs)
faqrouter.post('/faq', createfaqs)
faqrouter.get('/faq/:tbs_faq_id', getFaqByid)
faqrouter.get('/faqs/:column', getFaq)
faqrouter.delete('/faq/:question_id', deleteApi)
faqrouter.get('/faqs', getAllFaq)

module.exports = { faqrouter }