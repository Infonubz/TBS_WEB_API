const {tbsWebPool, abhiBusPool } = require('../config/dbconfig')
const cron = require('node-cron')
  
   //GET BY MOBILE_NUMBER API OF TICKET VIEW LEFT JOIN BOOKING DETAILS
   const getTicketView = async (req, res) => {
    const { Booking_Id, mobile_number } = req.body;
    try {
      const query = `
        SELECT 
        tv.*, 
        bd.price, 
        od.logos,
        tb.luxury_bus
        FROM ticket_details tv 
        LEFT JOIN booking_details bd ON tv."Booking_Id" = bd."Booking_Id" 
        LEFT JOIN operators_logo od ON TRIM(LOWER(tv.operator_name)) = TRIM(LOWER(od.operator_name))
        LEFT JOIN tbs_bus_info tb ON tv."bus_id" = tb."bus_id"
        WHERE tv."Booking_Id" = $1 AND tv.mobile_number = $2`;
  
      const values = [Booking_Id, mobile_number];
      const result = await tbsWebPool.query(query, values);

      const formattedResponse = result.rows.map(row => {
        const droppingPointTime = row.Dropping_Point_Time || '';
        const [droppingPoint, droppingTime] = droppingPointTime.split(' (');
        const cleanDroppingTime = droppingTime ? droppingTime.replace(')', '').trim().replace(':', '.') : '';
        const bustype = row.luxury_bus === null ? 'regular' : 'luxury';
        return {
          ...row,
          Dropping_Point: droppingPoint.trim(),  
          Droppimg_Time: cleanDroppingTime,      
          Dropping_Point_Time: undefined,
          bus_type_status:bustype, 
        }
      });
  
      res.status(200).json(formattedResponse);
    } catch (error) {
      console.error('Error getting ticket view:', error);
      res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
  };
  
  
//GET BY MOBILE_NUMBER API OF cancellation TICKET VIEW LEFT JOIN BOOKING DETAILS
const getTicketViewForCancellation = async (req, res) => {
    const { Booking_Id, mobile_number } = req.body;
    try {
      const query = `
        SELECT 
        tv.*, 
        bd.price, 
        od.logos,
        FROM ticket_details tv 
        LEFT JOIN booking_details bd ON tv."Booking_Id" = bd."Booking_Id" 
        LEFT JOIN operators_logo od ON TRIM(LOWER(tv.operator_name)) = TRIM(LOWER(od.operator_name))
        WHERE tv."Booking_Id" = $1 AND tv.mobile_number = $2 AND tv.status = 'upcoming'`;
  
      const values = [Booking_Id, mobile_number];
      const result = await tbsWebPool.query(query, values);
  
      const formattedResponse = result.rows.map(row => {
        const droppingPointTime = row.Dropping_Point_Time || '';
        const [droppingPoint, droppingTime] = droppingPointTime.split(' (');
        const cleanDroppingTime = droppingTime ? droppingTime.replace(')', '').trim().replace(':', '.') : '';
  
        return {
          ...row,
          Dropping_Point: droppingPoint.trim(),  
          Droppimg_Time: cleanDroppingTime,      
          Dropping_Point_Time: undefined 
        };
      });
  
      res.status(200).json(formattedResponse);
    } catch (error) {
      console.error('Error getting ticket view for cancellation:', error);
      res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
  }   

//GET TICKET BY STATUS
  const getAllTicket = async (req, res) => {
    try {
        const id = parseInt(req.params.status_id)
  
        let query;
        let values;
  
        if (id === 4) {
            query = `SELECT td.*, bd.price
            FROM ticket_details td
            LEFT JOIN booking_details bd ON td."Booking_Id" = bd."Booking_Id" `
        } else {
            query = `SELECT td.*, bd.price
            FROM ticket_details td
            LEFT JOIN booking_details bd ON td."Booking_Id" = bd."Booking_Id"  
            WHERE td.status_id = $1`
            values = [id];
        }
  
        const result = await tbsWebPool.query(query, values)
        res.status(200).json(result.rows)
    } catch (err) {
        console.error(err.message);
        res.status(201).json({ error: 'Database query failed' })
    }
  }

//get All Upcoming Journey
const UpcomingJourney = async (req, res) => {
  const mobile_number = req.body.mobile_number;
  try {
    const queries = `
                    SELECT 
                  uj.*, 
                  bd.price, 
                  od.logos, 
                  tbi.luxury_bus 
              FROM upcoming_journey uj
              LEFT JOIN booking_details bd ON uj."Booking_Id" = bd."Booking_Id"
              LEFT JOIN operators_logo od ON TRIM(LOWER(uj.operator_name)) = TRIM(LOWER(od.operator_name))
              LEFT JOIN tbs_bus_info tbi ON uj.bus_id = tbi.bus_id
              WHERE uj.mobile_number = $1
              ORDER BY uj.view_id DESC;`;
    
    const result = await tbsWebPool.query(queries, [mobile_number]);

    const formattedResponse = result.rows.map(row => {
      const droppingPointTime = row.Dropping_Point_Time || '';
      const [droppingPoint, droppingTime] = droppingPointTime.split(' (');
      const cleanDroppingTime = droppingTime ? droppingTime.replace(')', '').trim().replace(':', '.') : '';

      console.log('luxury_bus value:', row.luxury_bus);

      const busTypeStatus = (row.luxury_bus && typeof row.luxury_bus === 'string' &&
        (row.luxury_bus.toLowerCase().includes('luxury') || 
         row.luxury_bus.toLowerCase().includes('bharat benz') || 
         row.luxury_bus.toLowerCase().includes('volvo') || 
         row.luxury_bus.toLowerCase().includes('washroom')))
        ? "luxury"
        : "regular";

      console.log('busTypeStatus:', busTypeStatus);

      return {
        ...row,
        Dropping_Point: droppingPoint.trim(),
        Droppimg_Time: cleanDroppingTime,
        Dropping_Point_Time: undefined,
        bus_type_status: busTypeStatus
      };
    });

    res.status(200).json(formattedResponse);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Database query failed' });
  }
}  

//get All Completed Journey
const CompletedJourney = async (req, res) => {
  const mobile_number = req.body.mobile_number;

  const tbsClient = await tbsWebPool.connect();  
  const abhibusClient = await abhiBusPool.connect();  

  try {
    const queries = `
      SELECT 
                  cj.*, 
                  bd.price, 
                  od.logos, 
                  tbi.luxury_bus 
              FROM compled_journey cj
              LEFT JOIN booking_details bd ON cj."Booking_Id" = bd."Booking_Id"
              LEFT JOIN operators_logo od ON TRIM(LOWER(uj.operator_name)) = TRIM(LOWER(od.operator_name))
              LEFT JOIN tbs_bus_info tbi ON cj.bus_id = tbi.bus_id
              WHERE cj.mobile_number = $1
              ORDER BY cj.view_id DESC; `;
    
    const result = await tbsClient.query(queries, [mobile_number]);

    const formattedResponse = await Promise.all(result.rows.map(async (row) => {
      const droppingPointTime = row.Dropping_Point_Time || '';
      const [droppingPoint, droppingTime] = droppingPointTime.split(' (');
      const cleanDroppingTime = droppingTime ? droppingTime.replace(')', '').trim().replace(':', '.') : '';

      const busTypeStatus = (row.luxury_bus && typeof row.luxury_bus === 'string' &&
      (row.luxury_bus.toLowerCase().includes('luxury') || 
       row.luxury_bus.toLowerCase().includes('bharat benz') || 
       row.luxury_bus.toLowerCase().includes('volvo') || 
       row.luxury_bus.toLowerCase().includes('washroom')))
      ? "luxury"
      : "regular";

      const bus_id = row.bus_id;

      const updateSeatStatus = async (client, tableName, busIdColumn, busId, seatId, statusValue) => {
      
        await client.query(`
          UPDATE ${tableName} 
          SET "seats_id_layout" = (
            SELECT jsonb_agg(
              CASE
                WHEN seat->>'id' = $2 THEN seat || jsonb_build_object('status', $3::text) 
                ELSE seat
              END
            )
            FROM jsonb_array_elements("seats_id_layout") AS seat
          ) 
          WHERE ${busIdColumn} = $1;
        `, [bus_id, seatId, statusValue]);
      };

      const seatStatus = row.seat_status; 

      let newStatus = seatStatus;
      if (seatStatus === 'BFF') newStatus = 'AFF';
      if (seatStatus === 'BFM') newStatus = 'AFM';
      if (seatStatus === 'BFA') newStatus = 'AFA';

      await Promise.all([
        updateSeatStatus(tbsClient, 'tbs_bus_info', '"bus_id"', bus_id, row.seat_id, newStatus),
        updateSeatStatus(abhibusClient, 'live_data_details', '"Bus_id"', bus_id, row.seat_id, newStatus)
      ]);

      return {
        ...row,
        Dropping_Point: droppingPoint.trim(),
        Droppimg_Time: cleanDroppingTime,
        Dropping_Point_Time: undefined,
        bus_type_status: busTypeStatus  
      };
    }));

    await Promise.all([tbsClient.query('COMMIT'), abhibusClient.query('COMMIT')]);

    res.status(200).json(formattedResponse);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Database query failed' });
  } finally {
    tbsClient.release();
    abhibusClient.release();
  }
}

//get All Cancelled Journey
const CancelledJourney = async (req, res) => {
    const mobile_number = req.body.mobile_number;
    try {
      const queries = `
        SELECT 
                  cj.*, 
                  bd.price, 
                  od.logos, 
                  tbi.luxury_bus 
              FROM cancelled_journey cj
              LEFT JOIN booking_details bd ON cj."Booking_Id" = bd."Booking_Id"
              LEFT JOIN operators_logo od ON TRIM(LOWER(uj.operator_name)) = TRIM(LOWER(od.operator_name))
              LEFT JOIN tbs_bus_info tbi ON cj.bus_id = tbi.bus_id
              WHERE cj.mobile_number = $1
              ORDER BY cj.view_id DESC;`;
  
      const result = await tbsWebPool.query(queries, [mobile_number]);
  
      const formattedResponse = result.rows.map(row => {
        const droppingPointTime = row.Dropping_Point_Time || '';
        const [droppingPoint, droppingTime] = droppingPointTime.split(' (');
        const cleanDroppingTime = droppingTime ? droppingTime.replace(')', '').trim().replace(':', '.') : '';
  
        console.log('luxury_bus value:', row.luxury_bus);
  
        const busTypeStatus = (row.luxury_bus && typeof row.luxury_bus === 'string' &&
          (row.luxury_bus.toLowerCase().includes('luxury') || 
           row.luxury_bus.toLowerCase().includes('bharat benz') || 
           row.luxury_bus.toLowerCase().includes('volvo') || 
           row.luxury_bus.toLowerCase().includes('washroom')))
          ? "luxury"
          : "regular";
  
        console.log('busTypeStatus:', busTypeStatus);
  
        return {
          ...row,
          Dropping_Point: droppingPoint.trim(),
          Droppimg_Time: cleanDroppingTime,
          Dropping_Point_Time: undefined,
          bus_type_status: busTypeStatus
        };
      })
  
      res.status(200).json(formattedResponse);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Database query failed' })
    }
  }  

// Function to move upcoming tickets
async function moveUpcomingTickets() {
    const client = await tbsWebPool.connect();
    try {
        await client.query('BEGIN');

        const upcomingTickets = await client.query(`
            SELECT * FROM public.ticket_details 
            WHERE status = 'upcoming'
        `);

        for (const ticket of upcomingTickets.rows) {
            await client.query(`
                INSERT INTO public.upcoming_journey (
                    "TBS_Partner_PNR_No", "Booking_Id", arrival_date, departure_date, 
                    arrival_time, departure_time, arrival_name, duration, 
                    departure_name, "Pickup_Point_and_Time", operator_name, 
                    "Dropping_Point_Time", "Bus_Type", mobile_number, 
                    passenger, email_id, status, status_id, bus_id
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                ON CONFLICT ("Booking_Id") 
                DO UPDATE SET 
                    "TBS_Partner_PNR_No" = EXCLUDED."TBS_Partner_PNR_No",
                    arrival_date = EXCLUDED.arrival_date,
                    departure_date = EXCLUDED.departure_date,
                    arrival_time = EXCLUDED.arrival_time,
                    departure_time = EXCLUDED.departure_time,
                    arrival_name = EXCLUDED.arrival_name,
                    duration = EXCLUDED.duration,
                    departure_name = EXCLUDED.departure_name,
                    "Pickup_Point_and_Time" = EXCLUDED."Pickup_Point_and_Time",
                    operator_name = EXCLUDED.operator_name,
                    "Dropping_Point_Time" = EXCLUDED."Dropping_Point_Time",
                    "Bus_Type" = EXCLUDED."Bus_Type",
                    mobile_number = EXCLUDED.mobile_number,
                    passenger = EXCLUDED.passenger,
                    email_id = EXCLUDED.email_id,
                    status = EXCLUDED.status,
                    status_id = EXCLUDED.status_id,
                    bus_id = EXCLUDED.bus_id
            `, [
                ticket["TBS_Partner_PNR_No"], ticket["Booking_Id"], ticket.arrival_date, 
                ticket.departure_date, ticket.arrival_time, ticket.departure_time, 
                ticket.arrival_name, ticket.duration, ticket.departure_name, 
                ticket["Pickup_Point_and_Time"], ticket.operator_name, ticket["Dropping_Point_Time"], 
                ticket["Bus_Type"], ticket.mobile_number, JSON.stringify(ticket.passenger), ticket.email_id, 
                ticket.status, ticket.status_id, ticket.bus_id
            ]);
        }
        await client.query(`
            DELETE FROM public.upcoming_journey 
            WHERE "Booking_Id" NOT IN (
                SELECT "Booking_Id" FROM public.ticket_details WHERE status = 'upcoming'
            ) `)

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error moving upcoming tickets:', error);
    } finally {
        client.release();
    }
}


// Function to move completed tickets
async function moveCompletedTickets() {
  const client = await tbsWebPool.connect();
  try {
      const today = new Date().toISOString().slice(0, 10);

      const completedTickets = await client.query(`
          SELECT * FROM public.ticket_details 
          WHERE arrival_date < $1 FOR UPDATE SKIP LOCKED`, [today]);

      for (const ticket of completedTickets.rows) {
          let attempts = 0;
          const maxAttempts = 3;

          while (attempts < maxAttempts) {
              try {
                  await client.query('BEGIN');

                  await client.query(`
                      INSERT INTO public.compled_journey (
                          "TBS_Partner_PNR_No", "Booking_Id", arrival_date, departure_date, 
                          arrival_time, departure_time, arrival_name, duration, 
                          departure_name, "Pickup_Point_and_Time", operator_name, 
                          "Dropping_Point_Time", "Bus_Type", mobile_number, 
                          passenger, email_id, status, status_id, bus_id
                      )
                      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
                      ON CONFLICT ("Booking_Id") DO NOTHING `, [
                      ticket["TBS_Partner_PNR_No"], ticket["Booking_Id"], ticket.arrival_date, 
                      ticket.departure_date, ticket.arrival_time, ticket.departure_time, 
                      ticket.arrival_name, ticket.duration, ticket.departure_name, 
                      ticket["Pickup_Point_and_Time"], ticket.operator_name, ticket["Dropping_Point_Time"], 
                      ticket["Bus_Type"], ticket.mobile_number, JSON.stringify(ticket.passenger), ticket.email_id, 
                      'completed', 2, ticket.bus_id
                  ]);

                  await client.query(`
                      UPDATE public.ticket_details
                      SET status = 'completed', status_id = 2
                      WHERE "Booking_Id" = $1`, [ticket["Booking_Id"]]);

                  await client.query('COMMIT');
                  break; 
              } catch (error) {
                  await client.query('ROLLBACK');

                  if (error.code === '40P01') { 
                      attempts++;
                      if (attempts === maxAttempts) {
                          console.error('Max retry attempts reached for deadlock on Booking_Id:', ticket["Booking_Id"]);
                      } else {
                          console.log(`Deadlock detected, retrying (${attempts}/${maxAttempts}) for Booking_Id:`, ticket["Booking_Id"]);
                      }
                  } else {
                      console.error('Error moving ticket:', error);
                      break; 
                  }
              }
          }
      }
  } catch (error) {
      console.error('Error fetching completed tickets:', error);
  } finally {
      client.release();
  }
}


//TICKET CANCELLATION API
const ticketcancel = async (req, res) => {
    const { mobile_number, Booking_Id, seat_numbers, status } = req.body;

    if (!Array.isArray(seat_numbers) || seat_numbers.length === 0) {
        return res.status(400).json({ message: 'Seat numbers must be provided as a non-empty array.' });
    }

    if (!Array.isArray(status) || status.length !== seat_numbers.length) {
        return res.status(400).json({ message: 'Status must be a non-empty array with the same length as seat numbers.' });
    }

    const [clientTbs, clientAbhibus] = await Promise.all([
        tbsWebPool.connect(),
        abhiBusPool.connect()
    ]);

    try {
        await Promise.all([clientTbs.query('BEGIN'), clientAbhibus.query('BEGIN')]);

        const { rows: passengerRows } = await clientTbs.query(
            `SELECT passenger, bus_id, "TBS_Partner_PNR_No", "Booking_Id", arrival_date, departure_date, 
                    arrival_time, departure_time, arrival_name, duration, departure_name, 
                    "Pickup_Point_and_Time", operator_name, "Dropping_Point_Time", "Bus_Type", email_id
             FROM public.ticket_details 
             WHERE mobile_number = $1 AND "Booking_Id" = $2`,
            [mobile_number, Booking_Id]
        );
        
        if (passengerRows.length === 0) {
            return res.status(404).json({ message: 'Booking_Id or mobile number not found.' });
        }
        
        const { passenger: passengersJson, bus_id, ...ticketData } = passengerRows[0];
        
        console.log('Raw passengers data:', passengersJson);

        let passengers = [];
        if (passengersJson) {
            passengers = passengersJson; 
            console.log('Parsed passengers:', passengers); 
        }

        if (passengers.length === 0) {
            return res.status(404).json({ message: 'No passengers found for this Booking_Id.' });
        }

        const canceledPassengers = passengers.filter(p => seat_numbers.includes(p.seat));
        const remainingPassengers = passengers.filter(p => !seat_numbers.includes(p.seat));

        if (canceledPassengers.length === 0) {
            return res.status(404).json({ message: 'No passengers found for the provided seat numbers.' });
        }

        if (remainingPassengers.length === 0) {
           
            await clientTbs.query(
                `DELETE FROM public.ticket_details 
                 WHERE mobile_number = $1 AND "Booking_Id" = $2`,
                [mobile_number, Booking_Id]
            );
        } else {
            
            await clientTbs.query(
                `UPDATE public.ticket_details 
                 SET passenger = $1 
                 WHERE mobile_number = $2 AND "Booking_Id" = $3`,
                [JSON.stringify(remainingPassengers), mobile_number, Booking_Id]
            );
        }

        await clientTbs.query(
            `INSERT INTO public.cancelled_tickets
             ("TBS_Partner_PNR_No", "Booking_Id", arrival_date, departure_date, arrival_time, departure_time,
              arrival_name, duration, departure_name, "Pickup_Point_and_Time", operator_name, 
              "Dropping_Point_Time", "Bus_Type", mobile_number, passenger, email_id, status, status_id, bus_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'cancelled', 3, $17)`,
            [
                ticketData["TBS_Partner_PNR_No"], ticketData["Booking_Id"], ticketData.arrival_date, ticketData.departure_date,
                ticketData.arrival_time, ticketData.departure_time, ticketData.arrival_name, ticketData.duration,
                ticketData.departure_name, ticketData["Pickup_Point_and_Time"], ticketData.operator_name,
                ticketData["Dropping_Point_Time"], ticketData["Bus_Type"], mobile_number, 
                JSON.stringify(canceledPassengers), ticketData.email_id, bus_id
            ]
        );

        const canceledSeats = canceledPassengers.map(p => p.seat);

        const updateSeatStatus = async (client, tableName, busIdColumn) => {
            for (let i = 0; i < canceledSeats.length; i++) {
                const seat = canceledSeats[i];
                const statusValue = status[i];
                await client.query(`
                    UPDATE ${tableName} 
                    SET seats_id_layout = (
                        SELECT jsonb_agg(
                            CASE
                                WHEN seat->>'id' = $2 THEN seat || jsonb_build_object('status', $3::text) 
                                ELSE seat
                            END
                        )
                        FROM jsonb_array_elements(seats_id_layout) AS seat
                    ) 
                    WHERE ${busIdColumn} = $1`,
                    [bus_id, seat, statusValue] 
                );
            }
        };

        await Promise.all([
            updateSeatStatus(clientTbs, 'tbs_bus_info', 'bus_id'),
            updateSeatStatus(clientAbhibus, 'live_data_details', '"Bus_id"')
        ]);

        await Promise.all([clientTbs.query('COMMIT'), clientAbhibus.query('COMMIT')]);

        return res.status(200).json({
            message: `${seat_numbers.length > 1 ? 'Seats' : 'Seat'} cancelled successfully, seats updated.`
        });

    } catch (error) {
        await Promise.all([clientTbs.query('ROLLBACK'), clientAbhibus.query('ROLLBACK')]);

        console.error('Error cancelling ticket:', error);
        return res.status(500).json({ message: 'Internal server error.' });
    } finally {
        [clientTbs, clientAbhibus].forEach(client => client.release());
    }
};


cron.schedule('*/1 * * * * *', () => {
    moveUpcomingTickets()
    moveCompletedTickets()
  })

module.exports = { getAllTicket, getTicketView, ticketcancel, UpcomingJourney, CompletedJourney, CancelledJourney, getTicketViewForCancellation }