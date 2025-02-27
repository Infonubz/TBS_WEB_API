const { nbzCrmPool } = require('../config/dbconfig');
const multer = require('multer');
const fs = require('fs');
const path = require('path');


const postReferEarnContent = async (req, res) => {
    const { referral_amount } = req.body;

    console.log('Uploaded file:', req.file); 

    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Procedure file is required' });
        }

        const filePath = req.file.path;
        const procedure = fs.readFileSync(filePath, 'utf8');

        if (!procedure || typeof procedure !== 'string') {
            return res.status(400).json({ message: 'Procedure text is required and must be a string' });
        }
        if (referral_amount === undefined || isNaN(referral_amount)) {
            return res.status(400).json({ message: 'Referral amount is required and must be a number' });
        }

        const query = `
            INSERT INTO refer_earn_content (procedure, referral_amount)
            VALUES ($1, $2)
        `;

        const result = await nbzCrmPool.query(query, [procedure, referral_amount]);

        fs.unlinkSync(filePath); 

        res.status(201).json({ message: 'Content created successfully' });

    } catch (error) {
        console.error('Error inserting data:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

const updateReferEarnContent = async (req, res) => {
    const { referral_amount } = req.body;

    console.log('Uploaded file:', req.file);

    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Procedure file is required' });
        }

        const filePath = req.file.path;
        const procedure = fs.readFileSync(filePath, 'utf8'); 

        if (!procedure || typeof procedure !== 'string') {
            return res.status(400).json({ message: 'Procedure text is required and must be a string' });
        }

        if (referral_amount === undefined || isNaN(referral_amount)) {
            return res.status(400).json({ message: 'Referral amount is required and must be a number' });
        }

        const query = `
            UPDATE refer_earn_content
            SET procedure = $1, referral_amount = $2
        `;

        const result = await nbzCrmPool.query(query, [procedure, referral_amount]);

        fs.unlinkSync(filePath); // Delete the uploaded file after reading it

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'No content to update' });
        }

        res.status(200).json({ message: 'Content updated successfully' });

    } catch (error) {
        console.error('Error updating data:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};


const getReferEarnContent = async (req, res) => {
    try {
        const query = 'SELECT * FROM refer_earn_content';
        
        const result = await nbzCrmPool.query(query);

        if (result.rows.length > 0) {
            res.status(200).json(result.rows); 
        } else {
            res.status(404).json({ message: 'No data found' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


const postReferEarn = async (req, res) => {
    const { earned_amount, referral_list, mobile_number } = req.body;

    try {
        // Validate referral_list
        if (!Array.isArray(referral_list)) {
            return res.status(400).json({ message: 'referral_list must be an array' });
        }

        // Fetch referral_code and user_name from passenger_profile
        const { rows: passengerRows } = await nbzCrmPool.query(
            'SELECT referral_code, user_name FROM passenger_profile WHERE mobile_number = $1',
            [mobile_number]
        );

        if (passengerRows.length === 0) {
            return res.status(404).json({ message: 'Passenger not found' });
        }

        const { referral_code, user_name } = passengerRows[0];

        // Convert referral_list to JSON string
        const referralListJson = JSON.stringify(referral_list);

        // Insert into refer_earn table
        const insertReferEarnQuery = `
            INSERT INTO refer_earn (referral_code, mobile_number, passenger_name, referral_list, earned_amount)
            VALUES ($1, $2, $3, $4, $5)
        `;
        await nbzCrmPool.query(insertReferEarnQuery, [referral_code, mobile_number, user_name, referralListJson, earned_amount]);

        res.status(201).json({ message: 'Referral created successfully', referral_code });
    } catch (error) {
        console.error('Error inserting data:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};



const getReferEarn = async (req, res) => {
    try {
        const query = 'SELECT * FROM refer_earn';
        
        const result = await nbzCrmPool.query(query);

        if (result.rows.length > 0) {
            res.status(200).json(result.rows); 
        } else {
            res.status(404).json({ message: 'No data found' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


module.exports = {
    postReferEarnContent,
    postReferEarn,
    getReferEarn,
    getReferEarnContent,
    updateReferEarnContent
}