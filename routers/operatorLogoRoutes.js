const express = require('express');
const multer = require('multer')
const path = require('path');

const { createOperatorLogos, OperatorLogos, updateOperatorLogos, deleteOperatorLogos } = require('../controllers/OperatorLogoController');
const { importOperators } = require('../controllers/OperatorLogoController');

const logoRouter = express.Router();

const logo_storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/operator_logos/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueSuffix);
    }
});

const logo_upload = multer({ 
    storage: logo_storage,
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

const app = express();

// Middleware to parse form-data (required for multer)
app.use(logo_upload.none()); // Use multer to handle form-data without file uploads

logoRouter.post('/operator-logos', logo_upload.array('logos', 10), createOperatorLogos)
logoRouter.get('/operator-logos', OperatorLogos)
logoRouter.put('/operator-logo', logo_upload.array('logos'), updateOperatorLogos)
logoRouter.delete('/operator-logos/:id', deleteOperatorLogos)

logoRouter.post('/operatorSheetImport', logo_upload.single('xlsxFile'), importOperators);



module.exports = { logoRouter }