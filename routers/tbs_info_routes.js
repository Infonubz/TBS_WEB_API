const express = require('express');
const multer = require('multer');
const path = require('path');
const { postTbsInfo, getTbsInfo } = require('../controllers/tbs_info_controller');

const tbsInfoRouter = express.Router()

// Configure multer for file uploads
const infoStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'tbsInfo_uploads/'); 
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const infoUpload = multer({ storage: infoStorage });


tbsInfoRouter.post('/tbsInfo', infoUpload.fields([
    { name: 'about_us_file', maxCount: 1 },
    { name: 'privacy_policy_file', maxCount: 1 },
    { name: 'user_agreement_file', maxCount: 1 },
    { name: 'terms_conditions_file', maxCount: 1 }
]), postTbsInfo);
tbsInfoRouter.get('/tbsInfo', getTbsInfo);


module.exports = { tbsInfoRouter }