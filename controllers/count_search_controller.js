const { tbsWebPool } = require('../config/dbconfig');


// COUNT BOARDING AND DROPPING POINTS
const countBoardingDropping = async (req, res) => {
    const { source_name, destination_name, departure_date_time } = req.body;
 
    if (!source_name || !destination_name || !departure_date_time) {
        return res.status(201).json({ message: 'Source name, destination name, and departure datetime are required.' });
    }
 
    try {
        const query = `
        WITH boarding_counts AS (
            SELECT
                boarding_point->>'name' AS name,
                COUNT(*) AS count
            FROM
                tbs_bus_info,
                jsonb_array_elements(boarding) AS boarding_point
            WHERE
                LOWER("source_name") = LOWER($1)
                AND LOWER("destination_name") = LOWER($2)
                AND DATE("departure_date_time") = $3
            GROUP BY name
        ),
        dropping_counts AS (
            SELECT
                dropping_point->>'name' AS name,
                COUNT(*) AS count
            FROM
                tbs_bus_info,
                jsonb_array_elements(dropping) AS dropping_point
            WHERE
                LOWER("source_name") = LOWER($1)
                AND LOWER("destination_name") = LOWER($2)
                AND DATE("departure_date_time") = $3
            GROUP BY name
        ),
        amenities_counts AS (
            SELECT
                LOWER(unnest(string_to_array(amenities, ','))) AS amenity,
                COUNT(*) AS count
            FROM
                tbs_bus_info
            WHERE
                LOWER("source_name") = LOWER($1)
                AND LOWER("destination_name") = LOWER($2)
                AND DATE("departure_date_time") = $3
            GROUP BY amenity
        ),
        operator_names AS (
            SELECT DISTINCT
                LOWER("operator_name") AS operator
            FROM
                tbs_bus_info
            WHERE
                LOWER("source_name") = LOWER($1)
                AND LOWER("destination_name") = LOWER($2)
                AND DATE("departure_date_time") = $3
        )
        SELECT
            'boarding' AS type, jsonb_agg(jsonb_build_object('name', name, 'count', count)) AS details
        FROM
            boarding_counts
        UNION ALL
        SELECT
            'dropping' AS type, jsonb_agg(jsonb_build_object('name', name, 'count', count)) AS details
        FROM
            dropping_counts
        UNION ALL
        SELECT
            'amenities' AS type, jsonb_agg(jsonb_build_object('amenity', amenity, 'count', count)) AS details
        FROM
            amenities_counts
        UNION ALL
        SELECT
            'operators' AS type, jsonb_agg(jsonb_build_object('operator', operator)) AS details
        FROM
            operator_names;
    `;
 
        const result = await tbsWebPool.query(query, [source_name, destination_name, departure_date_time]);
 
        if (result.rows.length === 0) {
            return res.status(201).json({ message: 'No matching boarding, dropping points, amenities, or operators found.' });
        }
 
        const boardingDetails = result.rows.find(row => row.type === 'boarding')?.details || [];
        const droppingDetails = result.rows.find(row => row.type === 'dropping')?.details || [];
        const amenitiesDetails = result.rows.find(row => row.type === 'amenities')?.details || [];
        const operatorDetails = result.rows.find(row => row.type === 'operators')?.details || [];
 
        res.status(200).json({
            boarding_points: boardingDetails,
            dropping_points: droppingDetails,
            amenities: amenitiesDetails,
            operators: operatorDetails 
        });
    } catch (error) {
        console.error('Error fetching boarding, dropping counts, amenities, or operators:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

//SEARCH BOARDING, DROPPING AND AMENITIES
const searchBoardingDropping = async (req, res) => {
    const { source_name, destination_name, departure_date_time, type, searchTerm } = req.body;

    if (!source_name || !destination_name || !departure_date_time) {
        return res.status(400).json({ message: 'Source name, destination name, and departure datetime are required.' });
    }

    try {
        let filterCondition = '';
        let searchCondition = '';
        const queryParams = [source_name, destination_name, departure_date_time];

        if (type === 'boarding') {
            filterCondition = 'boarding_counts';
            searchCondition = `LOWER(bname) LIKE LOWER($4)`;
        } else if (type === 'dropping') {
            filterCondition = 'dropping_counts';
            searchCondition = `LOWER(dname) LIKE LOWER($4)`;
        } else if (type === 'amenities') {
            filterCondition = 'amenities_counts';
            searchCondition = `LOWER(amenity) LIKE LOWER($4)`;
        } else if (type === 'operators') {
            filterCondition = 'operator_names';
            searchCondition = `LOWER(operator) LIKE LOWER($4)`;
        } else {
            return res.status(400).json({ message: 'Invalid type specified.' });
        }

        if (searchTerm) {
            queryParams.push(`%${searchTerm.toLowerCase()}%`); 
        } else {
            queryParams.push(`%%`); 
        }

        const query = `
        WITH boarding_counts AS (
            SELECT
                boarding_point->>'name' AS bname,
                COUNT(*) AS count
            FROM
                tbs_bus_info,
                jsonb_array_elements(boarding) AS boarding_point
            WHERE
                LOWER("source_name") = LOWER($1)
                AND LOWER("destination_name") = LOWER($2)
                AND DATE("departure_date_time") = $3
            GROUP BY boarding_point->>'name'
        ),
        dropping_counts AS (
            SELECT
                dropping_point->>'name' AS dname,
                COUNT(*) AS count
            FROM
                tbs_bus_info,
                jsonb_array_elements(dropping) AS dropping_point
            WHERE
                LOWER("source_name") = LOWER($1)
                AND LOWER("destination_name") = LOWER($2)
                AND DATE("departure_date_time") = $3
            GROUP BY dropping_point->>'name'
        ),
        amenities_counts AS (
            SELECT
                LOWER(unnest(string_to_array(amenities, ','))) AS amenity,
                COUNT(*) AS count
            FROM
                tbs_bus_info
            WHERE
                LOWER("source_name") = LOWER($1)
                AND LOWER("destination_name") = LOWER($2)
                AND DATE("departure_date_time") = $3
            GROUP BY amenity
        ),
        operator_names AS (
            SELECT DISTINCT
                LOWER("operator_name") AS operator,
                COUNT(*) OVER () AS count -- Adding a count column for operators
            FROM
                tbs_bus_info
            WHERE
                LOWER("source_name") = LOWER($1)
                AND LOWER("destination_name") = LOWER($2)
                AND DATE("departure_date_time") = $3
        )
        SELECT
            '${type}' AS type, 
            jsonb_agg(jsonb_build_object(
                '${type === 'boarding' ? 'name' : type === 'dropping' ? 'name' : type === 'amenities' ? 'amenity' : 'operator'}', 
                ${type === 'boarding' ? 'bname' : type === 'dropping' ? 'dname' : type === 'amenities' ? 'amenity' : 'operator'}, 
                'count', 
                ${type === 'operators' ? 'count' : 'count'}  -- Referencing count appropriately
            )) AS details
        FROM
            ${filterCondition}
        WHERE
            LOWER(${type === 'boarding' ? 'bname' : type === 'dropping' ? 'dname' : type === 'amenities' ? 'amenity' : 'operator'}) LIKE LOWER($4);`;

        const result = await tbsWebPool.query(query, queryParams);

        if (result.rows.length === 0) {
            return res.status(200).json({ message: 'No matching results found.' });
        }

        const details = result.rows[0]?.details || [];

        const sortedDetails = details.sort((a, b) => {
            const nameA = a[`${type === 'boarding' ? 'name' : type === 'dropping' ? 'name' : type === 'amenities' ? 'amenity' : 'operator'}`];
            const nameB = b[`${type === 'boarding' ? 'name' : type === 'dropping' ? 'name' : type === 'amenities' ? 'amenity' : 'operator'}`];

            const startsWithA = nameA.toLowerCase().startsWith(searchTerm.toLowerCase());
            const startsWithB = nameB.toLowerCase().startsWith(searchTerm.toLowerCase());

            if (startsWithA && !startsWithB) return -1; 
            if (!startsWithA && startsWithB) return 1;  
            return 0; 
        });

        let responseKey;
        if (type === 'boarding') {
            responseKey = 'boarding_point';
        } else if (type === 'dropping') {
            responseKey = 'dropping_point';
        } else if (type === 'amenities') {
            responseKey = 'amenities';
        } else if (type === 'operators') {
            responseKey = 'operators';
        }

        res.status(200).json({
            [responseKey]: sortedDetails,
        })
        
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};


module.exports = {
    countBoardingDropping,
    searchBoardingDropping
};
