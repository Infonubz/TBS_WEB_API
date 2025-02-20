const express = require('express');
const multer = require('multer');
const path = require('path');
const { importPeakCalendar, updatePeakCalendarPercentage, peakDate } = require('../controllers/peak_calendar_controller');

const calendarRouter = express.Router();

const calendar_storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'calendar_files/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueSuffix);
    }
});

const calendar_upload = multer({ 
    storage: calendar_storage,
    limits: { fileSize: 5 * 1024 * 1024 }, 
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only .xlsx files are allowed'), false);
        }
    }
})

calendarRouter.post('/peakCalendarImport', calendar_upload.single('xlsxFile'), importPeakCalendar);
calendarRouter.put('/peakCalendar', updatePeakCalendarPercentage);
calendarRouter.get('/getdate/:date', peakDate)
module.exports = calendarRouter;
