const { tbsWebPool } = require('../config/dbconfig')

const getAllstates = async (req, res) => {
    try {
        const result = await tbsWebPool.query('SELECT * FROM public.state_district_code');
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No state district records found.' });
        }
      
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error fetching data:', err);
        res.status(500).send('Internal server error.');
    }
}

// Controller to Get States by Name or Code using URL parameters
const getStatesByNameOrCode = async (req, res) => {
    const { search } = req.params; 

    if (!search) {
        return res.status(400).send('Search parameter is required.');
    }

    try {
        const result = await tbsWebPool.query(
            `SELECT id, state_district_name, short_form
            FROM public.state_district_code
            WHERE LOWER(state_district_name) LIKE LOWER($1) OR LOWER(short_form) LIKE LOWER($1)`,
            [`%${search}%`] 
        )

        if (result.rows.length > 0) {
            res.status(200).json(result.rows);
        } else {
            res.status(404).send('No states or districts found matching the search criteria.');
        }
    } catch (err) {
        console.error('Error fetching states by name or code:', err);
        res.status(500).send('Internal server error.');
    }
}

module.exports = { getAllstates, getStatesByNameOrCode }
