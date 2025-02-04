const { tbsWebPool } = require('../config/dbconfig')

//get Country codes
const CountryCode = async (req, res) => {
    try {
        const result = await tbsWebPool.query(`SELECT * FROM public.country_code`)
        res.status(200).json(result.rows)
    } catch (err) {
        console.error(err.message);
        res.status(201).json({ error: 'Database query failed' })
    }
}

module.exports = { CountryCode }