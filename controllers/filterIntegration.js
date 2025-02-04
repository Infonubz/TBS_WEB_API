const { tbsWebPool } = require('../config/dbconfig')

// FILTERS BY TAGS, DEPARTING TIME, ARRIVAL TIME, PRICE, DEPARTING DATE, AMINITIES, BOARDING POINT, DROPPING POINT, RATING, OPERATOR NAME

const Filtersin = async (req, res) => {
    const { source_name, destination_name, AC, NonAc, Seater, Sleeper, departure_time_range, arrival_time_range, price_range, departure_date, boarding_point, dropping_point, amenities, operator_name, rating, sort, regular_bus, luxury_bus } = req.body

    try {

        let jsonFilters = ''; 
        const queryParams = [];

        if (source_name) {
            jsonFilters += ` AND LOWER("source_name") = LOWER($${queryParams.length + 1})`;
            queryParams.push(source_name)
        }

        if (destination_name) {
            jsonFilters += ` AND LOWER("destination_name") = LOWER($${queryParams.length + 1})`;
            queryParams.push(destination_name)
        }

        const acFilter = AC ? AC.toLowerCase() === 'true' : false;
        const nonAcFilter = NonAc ? NonAc.toLowerCase() === 'true' : false;
        const seaterFilter = Seater ? Seater.toLowerCase() === 'true' : false;
        const sleeperFilter = Sleeper ? Sleeper.toLowerCase() === 'true' : false;

        if (acFilter && sleeperFilter) jsonFilters += ` AND (tags->>'ac')::boolean = true AND (tags->>'sleeper')::boolean = true`;
        if (acFilter && seaterFilter) jsonFilters += ` AND (tags->>'ac')::boolean = true AND (tags->>'seater')::boolean = true`;
        if (nonAcFilter && sleeperFilter) jsonFilters += ` AND (tags->>'nonAc')::boolean = true AND (tags->>'sleeper')::boolean = true`;
        if (nonAcFilter && seaterFilter) jsonFilters += ` AND (tags->>'nonAc')::boolean = true AND (tags->>'seater')::boolean = true`;
        if (acFilter && !sleeperFilter && !seaterFilter && !nonAcFilter) jsonFilters += ` AND (tags->>'ac')::boolean = true`;
        if (nonAcFilter && !sleeperFilter && !seaterFilter && !acFilter) jsonFilters += ` AND (tags->>'nonAc')::boolean = true`;
        if (sleeperFilter && !acFilter && !seaterFilter && !nonAcFilter) jsonFilters += ` AND (tags->>'sleeper')::boolean = true`;
        if (seaterFilter && !acFilter && !sleeperFilter && !nonAcFilter) jsonFilters += ` AND (tags->>'seater')::boolean = true`;
        if (sleeperFilter && seaterFilter) jsonFilters += ` AND (tags->>'sleeper')::boolean = true AND (tags->>'seater')::boolean = true`;

        if (departure_date) {
            jsonFilters += ` AND ("departure_date_time"::date = $${queryParams.length + 1})`;
            queryParams.push(departure_date);
        }

                // Time Range Filters (Departure Time)
                if (departure_time_range) {
                    const timeRanges = {
                        '6am-11am': ['06:00', '11:00'],
                        '11am-6pm': ['11:00', '18:00'],
                        '6pm-11pm': ['18:00', '23:00'],
                        '11pm-6am': ['23:00', '06:00'] 
                    };
                
                    if (departure_time_range === '11pm-6am') {
                        jsonFilters += `
                            AND (
                                TO_CHAR(departure_date_time, 'HH24:MI') >= '23:00' OR 
                                TO_CHAR(departure_date_time, 'HH24:MI') < '06:00'
                            )`;
                    } else if (timeRanges[departure_time_range]) {
                        jsonFilters += ` 
                            AND TO_CHAR(departure_date_time, 'HH24:MI') BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
                        queryParams.push(...timeRanges[departure_time_range]);
                    }
                }
        
                // Time Range Filters (Arrival Time)
                if (arrival_time_range) {
                    const timeRanges = {
                        '6am-11am': [6, 11],
                        '11am-6pm': [11, 18],
                        '6pm-11pm': [18, 23],
                        '11pm-6am': [23, 6]
                    };
        
                    if (arrival_time_range === '11pm-6am') {
                        jsonFilters += `
                            AND (
                                EXTRACT(HOUR FROM arrival_date_time) >= 23 OR 
                                EXTRACT(HOUR FROM arrival_date_time) < 6
                            )`;
                    } else if (timeRanges[arrival_time_range]) {
                        jsonFilters += ` 
                            AND EXTRACT(HOUR FROM arrival_date_time) BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}`;
                        queryParams.push(...timeRanges[arrival_time_range]);
                    }
                }  

        if (price_range && price_range.min !== undefined && price_range.max !== undefined) {
            jsonFilters += ` AND (
                (CASE 
                    WHEN low_price->>'price' IS NOT NULL AND low_price->>'price' ~ '^[0-9]+(\\.[0-9]+)?$' THEN 
                        CAST(low_price->>'price' AS NUMERIC) 
                    ELSE 
                        NULL 
                END BETWEEN $${queryParams.length + 1} AND $${queryParams.length + 2}) 
            )`;
            queryParams.push(price_range.min, price_range.max);
        }

        if (amenities) {
            const amenitiesArray = amenities.split(',').map(val => `%${val.trim()}%`);
            const likeClauses = amenitiesArray.map((_, i) => `"amenities" ILIKE $${queryParams.length + i + 1}`);
            queryParams.push(...amenitiesArray);
            jsonFilters += ` AND (${likeClauses.join(' OR ')})`;
        }

        const addMultipleValueCondition = (columnName, values) => {
            if (values) {
                const valueArray = values.split(',').map(val => val.trim());
                queryParams.push(...valueArray);
                return `
                    AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements(${columnName}) AS elem
                        WHERE elem->>'name' ILIKE ANY (ARRAY[${valueArray.map((_, i) => `$${i + queryParams.length - valueArray.length + 1}`).join(', ')}]))`;
            }
            return '';
        };

        jsonFilters += addMultipleValueCondition('boarding', boarding_point);

        jsonFilters += addMultipleValueCondition('dropping', dropping_point);

        if (operator_name) {
            const operatorsArray = operator_name.split(',').map(val => val.trim());
            const operatorConditions = operatorsArray.map((_, i) => `LOWER(tbs."operator_name") = LOWER($${queryParams.length + i + 1})`);
            jsonFilters += ` AND (${operatorConditions.join(' OR ')})`;
            queryParams.push(...operatorsArray);
        }        
        
        if (rating) {
            jsonFilters += ` AND "rating" = $${queryParams.length + 1}`;
            queryParams.push(rating);
        }

        const orderByClauses = [];
        if (sort && Array.isArray(sort) && sort.length > 0) {
            const sorting = sort[0];
            if (sorting.price) {
                orderByClauses.push('("low_price" ->>\'price\') :: decimal ASC');
            }
            if (sorting.seats) {
                orderByClauses.push('("seat_availability"->>\'total\')::int DESC');
            }
            if (sorting.ratings) {
                orderByClauses.push('"rating" ASC');
            }
            if (sorting.departure_time) {
                orderByClauses.push('"departure_date_time" ASC');
            }
            if (sorting.arrival_time) {
                orderByClauses.push('"arrival_date_time" ASC');
            }
        }

        if (luxury_bus === true && regular_bus === true) {
        } else {
            if (luxury_bus === true) {
                jsonFilters += ` AND (
                    "luxury_bus" ILIKE '%Luxury%' OR 
                    "luxury_bus" ILIKE '%Bharat Benz%' OR 
                    "luxury_bus" ILIKE '%Volvo%' OR 
                    "luxury_bus" ILIKE '%Washroom%'
                )`;
            }
        
            if (regular_bus === true) {
                jsonFilters += ` AND (
                    "regular_bus" NOT ILIKE '%Luxury%' AND 
                    "regular_bus" NOT ILIKE '%Bharat Benz%' AND 
                    "regular_bus" NOT ILIKE '%Volvo%' AND 
                    "regular_bus" NOT ILIKE '%Washroom%' AND
                    "regular_bus" NOT ILIKE '%NULL%'
                )`;
            }
        }

        const busDetailsQuery = `
        SELECT tbs.*, ol.logos
        FROM tbs_bus_info tbs
        LEFT JOIN operators_logo ol
        ON TRIM(LOWER(tbs.operator_name)) = TRIM(LOWER(ol.operator_name))
            WHERE tbs.departure_date_time IS NOT NULL 
            AND tbs.arrival_date_time IS NOT NULL 
            ${jsonFilters}
            ${orderByClauses.length > 0 ? 'ORDER BY ' + orderByClauses.join(', ') : ''}
        `;
        
        const busDetailsResult = await tbsWebPool.query(busDetailsQuery, queryParams);

        const busDetails = busDetailsResult.rows.map(row => {
            let cancellation_policy = [];
            if (row.policy && row.policy.cancel) {
              cancellation_policy = row.policy.cancel.reverse();
            }
          
            return {
              bus_id: row.bus_id,
              operator_name: row.operator_name,
              source_name: row.source_name,
              destination_name: row.destination_name,
              departure_date_time: row.departure_date_time,
              arrival_date_time: row.arrival_date_time,
              time_duration: row.time_duration,
              bus_type: row.bus_type,
              seat_availability: row.seat_availability,
              rating: row.rating,
              amenities: row.amenities ? row.amenities.split(',').map(amenity => amenity.trim()) : [],
              boarding: row.boarding,
              dropping: row.dropping,
              lowest_price: row.low_price,
              link: row.link,
              logos: row.logos,
              cancellation_policy: cancellation_policy,
              bus_type_status: (row.luxury_bus && typeof row.luxury_bus === 'string' &&
                                (row.luxury_bus.toLowerCase().includes('luxury') ||
                                 row.luxury_bus.toLowerCase().includes('bharat benz') ||
                                 row.luxury_bus.toLowerCase().includes('volvo') ||
                                 row.luxury_bus.toLowerCase().includes('washroom')))
                                ? "luxury" : "regular"
            };
          })               

        return res.status(200).json({
            status: 'success',
            data: busDetails,
        })

    } catch (error) {
        console.error("Error processing bus info", error);
        return res.status(500).json({
            status: 'error',
            message: "Error processing bus info",
            error: error.message,
        })
    }
}

// COUNT BOARDING, DROPPING POINTS AND AMENITIES
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
            operator_names;`;

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


module.exports = { Filtersin, countBoardingDropping }
