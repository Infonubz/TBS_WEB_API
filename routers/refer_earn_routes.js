const express = require('express');
const multer = require('multer');
const path = require('path');
const { getReferEarn, postReferEarnContent, postReferEarn, getReferEarnContent, updateReferEarnContent } = require('../controllers/refer_earn_controller');


const referEarnRouter = express.Router();

const referStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'referEarn_uploads/'); 
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const referUpload = multer({ storage: referStorage });

referEarnRouter.post('/referEarnContent', referUpload.single('procedureFile'), postReferEarnContent);
referEarnRouter.post('/referEarn', postReferEarn);
referEarnRouter.get('/referEarn', getReferEarn);
referEarnRouter.get('/referEarnContent', getReferEarnContent);
referEarnRouter.put('/referEarnContent', referUpload.single('procedureFile'), updateReferEarnContent);

module.exports = { referEarnRouter }
