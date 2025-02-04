const express = require('express');
const multer = require('multer')
const path = require('path');
const { popularDomestics, createPopularDomestics, updateDomestics, deleteDomestics } = require('../controllers/popular_domestic_presence');


const popularouter = express.Router();

const domestic_storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/popular_domestic_presence/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueSuffix);
    }
});

const domestic_upload = multer({ 
    storage: domestic_storage,
    limits: { fileSize: 15 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            'image/jpeg', 
            'image/jpg',
            'image/png',
            'image/gif'
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only .jpeg, .jpg, .png, .gif files are allowed'), false);
        }
    }
})

popularouter.post('/popular-domestic-presence', domestic_upload.single('image'), createPopularDomestics)
popularouter.get('/popular-domestic-presence', popularDomestics)
popularouter.put('/popular-domestic-presence/:id', domestic_upload.single('image'), updateDomestics)
popularouter.delete('/popular-domestic-presence/:id', deleteDomestics)

module.exports = { popularouter }