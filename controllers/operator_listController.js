const { tbsWebPool } = require('../config/dbconfig')

//GET API FOR OPERATOR LIST
const operatorNameList = async (req, res) => {
    try {
        const result = await tbsWebPool.query(`SELECT operator_name FROM tbs_bus_info;`)
        
        const formattedResult = {
            "operator_name": result.rows.map(row => row.operator_name)
        };
        
        res.status(200).json(formattedResult)
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'database server error' })
    }
}

const operatorSearch = async (req, res) => {
    const { letter } = req.params
    const { search } = req.body

    try {
        let query = `SELECT operator_name FROM tbs_bus_info`
        let queryParams = []

        if (letter) {
            query += ` WHERE operator_name ILIKE $1`
            queryParams.push(`${letter}%`)
        }

        if (search) {
            if (queryParams.length > 0) {
                query += ` AND operator_name ILIKE $2`
                queryParams.push(`%${search}%`)
            } else {
                query += ` WHERE operator_name ILIKE $1`
                queryParams.push(`${search}%`)
            }
        }

        const result = await tbsWebPool.query(query, queryParams)

        const formattedResult = {
            operator_name: result.rows.map(row => row.operator_name)
        }
        
        res.status(200).json(formattedResult)
    } catch (error) {
        console.error(error)
        res.status(500).json({ error: 'database server error' })
    }
}

module.exports = { operatorNameList, operatorSearch }