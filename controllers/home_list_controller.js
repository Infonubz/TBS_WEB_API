const { tbsWebPool, tbsCrmPool } = require('../config/dbconfig');

// Controller function to handle POST request
const createHomeListEntry = async (req, res) => {
    try {
        const { tbs_details } = req.body;

        // Fetch deal_count from TBS_CRM database using tbsCrmPool
        const dealCountResult = await tbsCrmPool.query(`
            SELECT COUNT(*) AS deal_count
            FROM promotions_tbl
            WHERE LOWER(promo_status) = 'active'
        `);
        

        const deal_count = parseInt(dealCountResult.rows[0].deal_count, 10);

        // Fetch bus_operator_count from NBZ_CRM database using tbsWebPool
        const busOperatorCountResult = await tbsWebPool.query(`
            SELECT COUNT(DISTINCT Bus_id) AS bus_operator_count
            FROM tbs_bus_info
        `);

        const bus_operator_count = parseInt(busOperatorCountResult.rows[0].bus_operator_count, 10);

        // Static offer_percentage
        const offer_percentage = 20;

        const deals = [
            { deal_count },
            { bus_operator_count },
            { offer_percentage }
        ];

        // Convert the deals array to a JSON string
        const dealsJson = JSON.stringify(deals);

        // Insert into home_list
        const insertResult = await tbsWebPool.query(`
            INSERT INTO home_list (tbs_details, deals)
            VALUES ($1, $2)
            RETURNING *
        `, [tbs_details, dealsJson]);

        res.status(201).json(insertResult.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


// Function to handle POST request
const postHomeList = async (req, res) => {
    try {
        const { tbs_details, deals } = req.body;

        // Convert the deals array to a JSON string
        const dealsJson = JSON.stringify(deals);

        // Insert into home_list
        const insertResult = await tbsWebPool.query(`
            INSERT INTO home_list (tbs_details, deals)
            VALUES ($1, $2)
            RETURNING *
        `, [tbs_details, dealsJson]);

        res.status(201).json({ message: 'Inserted Successfully!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


const getHomeList = async (req, res) => {
    try {
        const query = 'SELECT * FROM home_list';
        
        const result = await tbsWebPool.query(query)
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
    createHomeListEntry,
    postHomeList,
    getHomeList
};
