const express = require('express');
const multer = require('multer')
const path = require('path');
const { TopBuses, createTopBusRoutes, updateBusRoutes, deleteRoutes } = require('../controllers/topBuses');

const toprouter = express.Router();

const bus_storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/top_bus_rotes/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueSuffix);
    }
});

const bus_upload = multer({ 
    storage: bus_storage,
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

toprouter.post('/top-bus-routes', bus_upload.single('image'), createTopBusRoutes)
toprouter.get('/top-bus-routes', TopBuses)
toprouter.put('/top-bus-routes/:id', bus_upload.single('image'), updateBusRoutes)
toprouter.delete('/top-bus-routes/:id', deleteRoutes)

module.exports = { toprouter }


