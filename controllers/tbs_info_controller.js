const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { nbzCrmPool } = require('../config/dbconfig');


const postTbsInfo = async (req, res) => {
    try {
        // Extract file paths from request
        const { about_us_file, privacy_policy_file, user_agreement_file, terms_conditions_file } = req.files;

        const aboutUsContent = fs.readFileSync(about_us_file[0].path, 'utf8');
        const privacyPolicyContent = fs.readFileSync(privacy_policy_file[0].path, 'utf8');
        const userAgreementContent = fs.readFileSync(user_agreement_file[0].path, 'utf8');
        const termsConditionsContent = fs.readFileSync(terms_conditions_file[0].path, 'utf8');

        // SQL query for inserting data into tbs_info table
        const insertQuery = `
            INSERT INTO tbs_info (about_us, privacy_policy, user_agreement, terms_conditions)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;

        const values = [aboutUsContent, privacyPolicyContent, userAgreementContent, termsConditionsContent];

        const result = await nbzCrmPool.query(insertQuery, values);

        res.status(201).json({ message: 'Inserted Successfully!'});

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

const getTbsInfo = async (req, res) => {
    try {
        const query = 'SELECT * FROM tbs_info';
        
        const result = await nbzCrmPool.query(query)
        if (result.rows.length > 0) {
            res.status(200).json(result.rows[0]);
        } else {
            res.status(404).json({ message: 'No data found' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    postTbsInfo,
    getTbsInfo
};
