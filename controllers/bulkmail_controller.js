const {tbsWebPool} = require('../config/dbconfig')
const nodemailer = require('nodemailer')


const getPassengerMail = async(req, res) =>{
    try {
        const Emailquery = `SELECT email_id FROM public.passenger_profile;` 
        const result = await tbsWebPool.query(Emailquery)
        res.status(200).json(result.rows)
    } catch (err) {
        console.error('Error fetching passenger emailids:', err);
        res.status(500).send('Internal server error.');
    }
}

module.exports = { getPassengerMail }