const {tbsWebPool} = require('../config/dbconfig')

exports.searchGetstations = async (req, res) => {
    const capitalized = str => {
        const firstLetter = str.charAt(0).toUpperCase();
        const restOfString = str.slice(1).replace(/[A-Z]/g, match => match.toLowerCase());
        return firstLetter + restOfString;
      };
    const { station_name } = req.params;
    const client = await tbsWebPool.connect();
    try {
        let result;
        
        if (station_name && typeof station_name === 'string' && station_name.trim() !== '' && station_name !== '$') {
            const searchValue = `%${station_name.toLowerCase()}%`;
            result = await client.query(
                `SELECT * FROM get_stations WHERE station_name ILIKE $1`,
                [searchValue]
            );
         
            const filteredData = result.rows.filter(item => item.station_name.startsWith(capitalized(station_name)));
            result = filteredData.slice(0, 25);
            return res.status(200).json(result)
        } 
        else{
            result = await client.query(`SELECT * FROM get_stations ORDER BY source_id LIMIT 10`);
        }
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching stations:', error.message);
        res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        client.release();
    }
}
