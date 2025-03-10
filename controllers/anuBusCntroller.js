const { abhiBusPool, tbsBusPool, nbzCrmPool } = require('../config/dbconfig');
const cron = require('node-cron');

// FETCH PLATFORM DETAILS FROM ABHIBUS AND TBSBUS DATABASES
const fetchPlatformDetails = async () => {
  try {
    const [abhiPlatformData, tbsBusPlatformData] = await Promise.all([
      abhiBusPool.query(`
        SELECT id, "Platform_name" FROM platform_details`),
      tbsBusPool.query(`
        SELECT id, "Platform_name" FROM platform_details`)
    ]);
   
    const abhiPlatforms = abhiPlatformData.rows.map(row => [row.id, row.Platform_name]);
    const tbsBusPlatforms = tbsBusPlatformData.rows.map(row => [row.id, row.Platform_name]);

    return {
      abhiPlatforms,
      tbsBusPlatforms
    };
     
  } catch (err) {
    console.error('Error fetching platform details:', err);
    throw err;
  }
}

// FETCH BUSINFOS FROM ABHI_BUS AND TBSBUS DATABASES
const fetchBusInfo = async () => {
  try {
    const { abhiPlatforms, tbsBusPlatforms } = await fetchPlatformDetails();

    const abhiBusData = await abhiBusPool.query(`
          SELECT sdd."Operator_name", sdd."source_name", sdd."Destination_name",
          nldd.depat_datetime, nldd."Arrl_datetime", 
          nldd."Time_duration", sdd."Bus_id", 
          ldd.seats_avalble, nldd.rating, sdd.amenities, sdd.luxury_bus,  
          sdd.boarding, sdd.dropping, sdd.tags, sdd.regular_bus, sdd.policy,
          ldd.low_price AS abhi_low_price, ldd.seats_id_layout AS abhi_seats_id_layout, ldd.fares AS abhi_fares,
          pd.percentage AS abhi_platform_percentage, ldd.layout AS abhi_layout,
          pd.link AS abhi_platform_link,
          pd."Platform_name" AS abhi_platform_name,
          ldd."Abhi_id"
      FROM static_data_details sdd
      LEFT JOIN nearly_live_data_details nldd ON sdd."Bus_id" = nldd."Bus_id"
      LEFT JOIN live_data_details ldd ON sdd."Bus_id" = ldd."Bus_id"
      LEFT JOIN platform_details pd ON ldd."Abhi_id" = pd.id `);

    const tbsBusData = await tbsBusPool.query(`
          SELECT sdd."Operator_name", sdd."source_name", sdd."Destination_name",
          nldd.depat_datetime, nldd."Arrl_datetime", 
          nldd."Time_duration", sdd."Bus_id", sdd.policy,
          ldd.seats_avalble, nldd.rating, sdd.amenities, sdd.regular_bus,
          sdd.boarding, sdd.dropping, sdd.tags, sdd.luxury_bus,
          ldd.low_price AS tbs_low_price, ldd.seats_id_layout AS tbs_seats_id_layout, ldd.fares AS tbs_fares,
          pd.percentage AS tbs_platform_percentage, ldd.layout AS tbs_layout,
          pd.link AS tbs_platform_link,
          pd."Platform_name" AS tbs_platform_name,
          ldd."TBS_id"
      FROM static_data_details sdd
      LEFT JOIN nearly_live_data_details nldd ON sdd."Bus_id" = nldd."Bus_id"
      LEFT JOIN live_data_details ldd ON sdd."Bus_id" = ldd."Bus_id"
      LEFT JOIN platform_details pd ON ldd."TBS_id" = pd.id `);

    const busInfo = new Map();

    const currentDate = new Date();
    const nextDate = new Date(currentDate);
    nextDate.setDate(currentDate.getDate() + 1);

    const formatDateTime = (timeStr, date) => {
      const time = new Date(timeStr);
      time.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      return time.toISOString(); 
    };

    const safeParse = (data) => {
      if (typeof data === 'string') {
        try {
          return JSON.parse(data);
        } catch (e) {
          console.warn('Error parsing JSON:', e);
          return [];
        }
      }
      return Array.isArray(data) ? data : [];
    };

    for (const row of abhiBusData.rows) {
      const depDateTime = new Date(row.depat_datetime);
      const arrDateTime = new Date(row.Arrl_datetime);

      depDateTime.setFullYear(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
      arrDateTime.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());

      const boardingData = safeParse(row.boarding);
      const droppingData = safeParse(row.dropping);

      const updatedBoarding = boardingData.map(location => ({
        ...location,
        time: formatDateTime(location.time, currentDate) 
      }));

      const updatedDropping = droppingData.map(location => ({
        ...location,
        time: formatDateTime(location.time, nextDate) 
      }));

      const abhiPlatform = abhiPlatforms.find(p => p[0] === row.Abhi_id);
      busInfo.set(row.Bus_id, {
        operator_name: row.Operator_name,
        source_name: row.source_name,
        destination_name: row.Destination_name,
        departure_date_time: depDateTime,
        arrival_date_time: arrDateTime,
        bus_id: row.Bus_id,
        time_duration_hrs: convertMinutesToHours(row.Time_duration),
        seat_availability: row.seats_avalble,
        rating: row.rating,
        amenities: row.amenities,
        boarding: updatedBoarding, 
        dropping: updatedDropping, 
        bus_type: null,
        abhi_bus: row.abhi_low_price,
        tbsBus: null,
        low_price: JSON.stringify({
          id: row.Abhi_id,
          platform_name: abhiPlatform ? abhiPlatform[1] : 'Unknown',
          price: row.abhi_low_price
        }),
        link: row.abhi_platform_link,
        abhi_platform_percentage: row.abhi_platform_percentage,
        tbs_platform_percentage: null,
        tags: row.tags,
        luxury_bus: row.luxury_bus,
        regular_bus: row.regular_bus,
        seats_id_layout: row.abhi_seats_id_layout,
        fares: row.abhi_fares,
        layout: row.abhi_layout,
        policy: row.policy,
      });
    }

    for (const row of tbsBusData.rows) {
      const tbsBusPlatform = tbsBusPlatforms.find(p => p[0] === row.TBS_id);
      if (busInfo.has(row.Bus_id)) {
        const bus = busInfo.get(row.Bus_id);
        bus.tbsBus = row.tbs_low_price;
        bus.tbs_platform_percentage = row.tbs_platform_percentage;

        if (row.tbs_low_price < bus.abhi_bus || bus.abhi_bus === null) {
          bus.low_price = JSON.stringify({
            id: row.TBS_id,
            platform_name: tbsBusPlatform ? tbsBusPlatform[1] : 'Unknown',
            price: row.tbs_low_price
          });
          bus.link = row.tbs_platform_link;
          bus.seats_id_layout = row.tbs_seats_id_layout;
          bus.fares = row.tbs_fares;
          bus.layout = row.tbs_layout;
        } else if (row.tbs_low_price === bus.abhi_bus) {
          if (row.tbs_platform_percentage > bus.abhi_platform_percentage) {
            bus.low_price = JSON.stringify({
              id: row.TBS_id,
              platform_name: tbsBusPlatform ? tbsBusPlatform[1] : 'Unknown',
              price: row.tbs_low_price
            });
            bus.link = row.tbs_platform_link;
            bus.seats_id_layout = row.tbs_seats_id_layout;
            bus.fares = row.tbs_fares;
            bus.layout = row.tbs_layout;
          }
        }
      } else {
        const boardingData = safeParse(row.boarding);
        const droppingData = safeParse(row.dropping);

        const updatedBoarding = boardingData.map(location => ({
          ...location,
          time: formatDateTime(location.time, currentDate)
        }));

        const updatedDropping = droppingData.map(location => ({
          ...location,
          time: formatDateTime(location.time, nextDate) 
        }));

        busInfo.set(row.Bus_id, {
          operator_name: row.Operator_name,
          source_name: row.source_name,
          destination_name: row.Destination_name,
          departure_date_time: currentDate,
          arrival_date_time: nextDate,
          bus_id: row.Bus_id,
          time_duration_hrs: convertMinutesToHours(row.Time_duration),
          seat_availability: row.seats_avalble,
          rating: row.rating,
          amenities: row.amenities,
          boarding: updatedBoarding, 
          dropping: updatedDropping, 
          bus_type: null,
          abhi_bus: null,
          tbsBus: row.tbs_low_price,
          low_price: JSON.stringify({
            id: row.TBS_id,
            platform_name: tbsBusPlatform ? tbsBusPlatform[1] : 'Unknown',
            price: row.tbs_low_price
          }),
          link: row.tbs_platform_link,
          abhi_platform_percentage: null,
          tbs_platform_percentage: row.tbs_platform_percentage,
          tags: row.tags,
          luxury_bus: row.luxury_bus,
          regular_bus: row.regular_bus,
          seats_id_layout: row.tbs_seats_id_layout,
          fares: row.tbs_fares,
          layout: row.tbs_layout,
          policy: row.policy,
        });
      }
    }

    const busTypes = await tbsBusPool.query(`SELECT "Bus_id", "bus_type" FROM static_data_details`);
    const busTypesMap = new Map(busTypes.rows.map(row => [row.Bus_id, row.bus_type]));
    busInfo.forEach((bus, busId) => {
      bus.bus_type = busTypesMap.get(busId) || 'Unknown';
    });

    busInfo.forEach((bus, busId) => {
      if (bus.abhi_bus !== null && bus.tbsBus === null) {
        bus.low_price = JSON.stringify({
          id: busId,
          platform_name: 'AbhiBus',
          price: bus.abhi_bus
        });
      } else if (bus.abhi_bus === null && bus.tbsBus !== null) {
        bus.low_price = JSON.stringify({
          id: busId,
          platform_name: 'TBSBus',
          price: bus.tbsBus
        });
      }
    });

    return Array.from(busInfo.values());
  } catch (error) {
    console.error('Error fetching bus info:', error);
    throw error; 
  }
}

// INSERT, UPDATE AND DELETE TRIGGER FOR NBZCRM DATABASE anu_bus_info TABLE FROM ABHIBUS AND TBSBUS
const upsertBusInfo = async (busInfo) => {
  try {
    if (!Array.isArray(busInfo)) {
      throw new TypeError('busInfo is not iterable');
    }

    const currentBusIds = busInfo.map(bus => bus.bus_id);
    const existingBusIdsResult = await nbzCrmPool.query(`
      SELECT bus_id FROM anu_bus_info
    `);

    const existingBusIds = existingBusIdsResult.rows.map(row => row.bus_id);

    for (const existingBusId of existingBusIds) {
      if (!currentBusIds.includes(existingBusId)) {
        await nbzCrmPool.query(`DELETE FROM anu_bus_info WHERE bus_id = $1`, [existingBusId]);
        console.log(`Record with bus_id ${existingBusId} deleted as it's no longer in the source data.`);
      }
    }

    for (const bus of busInfo) {
      const boarding = JSON.stringify(bus.boarding);
      const dropping = JSON.stringify(bus.dropping);
      const tags = JSON.stringify(bus.tags);
      const amenities = bus.amenities;
      const low_price = bus.low_price;
      const luxury_bus = bus.luxury_bus;
      const regular_bus = bus.regular_bus;
      const seats_id_layout = JSON.stringify(bus.seats_id_layout);
      const fares = JSON.stringify(bus.fares);
      const policy = JSON.stringify(bus.policy);

      const depDateTime = new Date(bus.departure_date_time);
      const arrDateTime = new Date(bus.arrival_date_time);

      const currentDate = new Date();
      const nextDate = new Date(currentDate);
      nextDate.setDate(currentDate.getDate() + 1);

      depDateTime.setFullYear(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
      arrDateTime.setFullYear(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());

      try {
        JSON.parse(tags);
      } catch (err) {
        console.error('Invalid JSON format in tags:', tags);
        continue;
      }

      const result = await nbzCrmPool.query(`
        SELECT 1 FROM anu_bus_info WHERE bus_id = $1`, [bus.bus_id]);

      if (result.rowCount > 0) {
        await nbzCrmPool.query(`
          UPDATE anu_bus_info 
          SET 
            operator_name = $1, 
            source_name = $2, 
            destination_name = $3, 
            departure_date_time = $4::date + departure_date_time::time, 
            arrival_date_time = $5::date + arrival_date_time::time, 
            time_duration = $6, 
            seat_availability = $7, 
            rating = $8, 
            amenities = $9, 
            boarding = $10, 
            dropping = $11, 
            bus_type = $12, 
            abhi_bus = $13, 
            tbsBus = $14, 
            low_price = $15, 
            link = $16, 
            tags = $17, 
            luxury_bus = $18, 
            regular_bus = $19, 
            seats_id_layout = $20, 
            fares = $21, 
            layout = $22, 
            policy = $23 
          WHERE bus_id = $24
        `, [bus.operator_name, bus.source_name, bus.destination_name, depDateTime, arrDateTime, bus.time_duration_hrs, bus.seat_availability, bus.rating, amenities, boarding, dropping, bus.bus_type, bus.abhi_bus, bus.tbsBus, low_price, bus.link, tags, luxury_bus, regular_bus, seats_id_layout, fares, bus.layout, policy, bus.bus_id]);

        const updateSeatsQueryNbz = `
          WITH seat_counts AS (
            SELECT
              bus_id,
              COUNT(*) FILTER (WHERE seat->>'status' LIKE 'A%') AS total,
              COUNT(*) FILTER (WHERE seat->>'status' = 'AFF') AS avlFemale
            FROM
              anu_bus_info,
              jsonb_array_elements(seats_id_layout) AS seat
            WHERE bus_id = $1
            GROUP BY bus_id
          )
          UPDATE anu_bus_info
          SET seat_availability = jsonb_strip_nulls(jsonb_build_object(
            'total', CASE WHEN seat_counts.total > 0 THEN seat_counts.total ELSE 0 END, 
            'avlFemale', CASE WHEN seat_counts.avlFemale IS NULL THEN 0 ELSE seat_counts.avlFemale END
          ))
          FROM seat_counts
          WHERE anu_bus_info.bus_id = seat_counts.bus_id
          RETURNING anu_bus_info.bus_id, anu_bus_info.seat_availability;`;

        await nbzCrmPool.query(updateSeatsQueryNbz, [bus.bus_id]);

        const peakCalendarCheck = await nbzCrmPool.query(`
          SELECT pc."Percentage" 
          FROM "Peak_Calendar_2025_2030" pc 
          WHERE pc."Date" = $1
        `, [depDateTime.toISOString().split('T')[0]]);

        if (peakCalendarCheck.rowCount > 0) {
          const updateFaresQuery = `
            WITH updated_low_price AS (
              SELECT
                  u.bus_id,
                  jsonb_set(
                      low_price, 
                      '{price}', 
                      CASE 
                          WHEN pc."Percentage" = 1 THEN 
                              (low_price->>'price')::numeric * 0.99
                          WHEN pc."Percentage" = 2 THEN 
                              (low_price->>'price')::numeric * 0.98
                          ELSE 
                              (low_price->>'price')::numeric
                      END::text::jsonb
                  ) AS new_low_price
              FROM anu_bus_info u
              JOIN "Peak_Calendar_2025_2030" pc ON u.departure_date_time::date = pc."Date"
              WHERE u.bus_id = $1
            ),
            updated_seats AS (
              SELECT
                  bus_id,
                  jsonb_agg(
                      jsonb_set(
                          seat, 
                          '{fare,totalNetFare}', 
                          CASE 
                              WHEN pc."Percentage" = 1 THEN 
                                  (seat->'fare'->>'totalNetFare')::numeric * 0.99
                              WHEN pc."Percentage" = 2 THEN 
                                  (seat->'fare'->>'totalNetFare')::numeric * 0.98
                              ELSE 
                                  (seat->'fare'->>'totalNetFare')::numeric
                          END::text::jsonb
                      )
                  ) AS new_seats_id_layout
              FROM anu_bus_info
              JOIN jsonb_array_elements(seats_id_layout::jsonb) AS seat ON true
              JOIN "Peak_Calendar_2025_2030" pc ON anu_bus_info.departure_date_time::date = pc."Date"
              WHERE anu_bus_info.bus_id = $1
              GROUP BY bus_id
            )
            
            UPDATE anu_bus_info
            SET 
                low_price = updated_low_price.new_low_price,
                seats_id_layout = updated_seats.new_seats_id_layout
            FROM updated_low_price, updated_seats
            WHERE anu_bus_info.bus_id = updated_low_price.bus_id
              AND anu_bus_info.bus_id = updated_seats.bus_id
            RETURNING anu_bus_info.bus_id;  `;

          await nbzCrmPool.query(updateFaresQuery, [bus.bus_id]);
        }

      } else {
        await nbzCrmPool.query(`
          INSERT INTO anu_bus_info (
            operator_name, source_name, destination_name,
            departure_date_time, arrival_date_time, bus_id,
            time_duration, seat_availability, rating, amenities,
            boarding, dropping, bus_type, abhi_bus, tbsBus, low_price, link, tags, luxury_bus, regular_bus, seats_id_layout, fares, layout, policy
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
          )
        `, [
          bus.operator_name, bus.source_name, bus.destination_name, 
          depDateTime, arrDateTime, bus.bus_id, 
          bus.time_duration_hrs, bus.seat_availability, bus.rating, 
          amenities, boarding, dropping, bus.bus_type, bus.abhi_bus, 
          bus.tbsBus, low_price, bus.link, tags, luxury_bus, 
          regular_bus, seats_id_layout, fares, bus.layout, policy
        ]);
        console.log(`Record with bus_id ${bus.bus_id} inserted successfully.`);
      }
    }
  } catch (err) {
    console.error('Error upserting bus info:', err);
    throw err;
  }
}

const convertMinutesToHours = (minutes) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  let result = '';
  if (hours > 0) {
    result += `${hours} h${hours > 1 ? '' : ''}`;
  }
  if (mins > 0) {
    if (result) result += ' ';
    result += `${mins} m${mins > 1 ? '' : ''}`;
  }

  return result || '0 min'; 
}

const updateBusInfoStatus = async (busInfo) => {
  try {
    if (!Array.isArray(busInfo)) {
      throw new TypeError('busInfo is not iterable');
    }
    for (const bus of busInfo) {
      await abhiBusPool.query(`UPDATE static_data_details SET processed = TRUE WHERE "Bus_id" = $1`, [bus.Bus_id]);
    }
    //console.log('Bus info status updated successfully');
  } catch (err) {
    console.error('Error updating bus info status:', err);
  }
}

const processBusInfo = async () => {
  try {
   // console.log('Polling for updates...');
    const busInfo = await fetchBusInfo();
    await upsertBusInfo(busInfo);
    await updateBusInfoStatus(busInfo);
  } catch (err) {
    console.error('Error during processing:', err);
  }
}

// DATA FETCHING BY POST SOURCE AND DESTINATION
const route = async (req, res) => {
  try {
    await processBusInfo();
    
    const { source_name, destination_name, departure_date_time } = req.body;
    if (!source_name || !destination_name || !departure_date_time) {
      return res.status(400).send('Missing required parameters');
    }
    
    const lowerCaseSourceName = source_name.toLowerCase();
    const lowerCaseDestinationName = destination_name.toLowerCase();
    
    const result = await nbzCrmPool.query(
      `SELECT anu.*, ol.logos
       FROM anu_bus_info anu
       LEFT JOIN operators_logo ol
       ON TRIM(LOWER(anu.operator_name)) = TRIM(LOWER(ol.operator_name))
       WHERE LOWER(anu.source_name) = $1
       AND LOWER(anu.destination_name) = $2
       AND DATE(anu.departure_date_time) = $3`,
      [lowerCaseSourceName, lowerCaseDestinationName, departure_date_time]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(result.rows); 
    }
    
    const formattedResult = result.rows.map(row => {
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
    });

    return res.status(200).json(formattedResult);
  } catch (err) {
    console.error('Error during route processing:', err);
    return res.status(500).send('Internal Server Error');
  }
}

//AUTOMATICALLY EXECUTING TASK EVERY 1 SECONDS 
const executeProcessBusInfo = async () => {
    await processBusInfo()  
    setImmediate(executeProcessBusInfo)
}

executeProcessBusInfo()


module.exports = { route, processBusInfo }
