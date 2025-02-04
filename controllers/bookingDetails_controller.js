const {  tbsWebPool, abhiBusPool } = require('../config/dbconfig');
const crypto = require('crypto')
const nodemailer = require('nodemailer')

//POST API OF BOOKING DETAILS
const bookingDetails = async (req, res) => {
    const { departure_name, arrival_name, date, pickup, drop, passenger, email_id, mobile_number, bus_id } = req.body;

    if (![departure_name, arrival_name, date, pickup, drop, passenger, email_id, mobile_number, bus_id].every(Boolean)) {
        return res.status(400).json({ message: 'All fields are required' });
    }

    const [clientTbs, clientabhi] = await Promise.all([
        tbsWebPool.connect(), abhiBusPool.connect()
    ]);

    try {
        await Promise.all([clientTbs.query('BEGIN'), clientabhi.query('BEGIN')]);

        const busResult = await clientTbs.query('SELECT seats_id_layout FROM tbs_bus_info WHERE bus_id = $1', [bus_id]);
        if (!busResult.rowCount) throw { status: 404, message: 'Bus ID does not exist in NBZ' };

        const seatsIdLayout = busResult.rows[0].seats_id_layout;
        if (!seatsIdLayout || typeof seatsIdLayout !== 'object') {
            throw { status: 500, message: 'Invalid seat layout format' };
        }

        const seatIds = passenger.flatMap(p => p.seat);

        const seatCheckResult = await clientTbs.query(`
            SELECT jsonb_agg(seat) AS updated_seats
            FROM jsonb_array_elements($1::jsonb) AS seat
        `, [JSON.stringify(seatsIdLayout)]);

        const updatedSeats = seatCheckResult.rows[0].updated_seats;

        for (const seatId of seatIds) {
            const seatInfo = updatedSeats.find(s => s.id === seatId);
            if (!seatInfo) throw { status: 404, message: `Seat ${seatId} does not exist` };
            if (['BFA', 'BFF', 'BFM'].includes(seatInfo.status)) throw { status: 409, message: `Seat ${seatId} is already booked` };
        }

        const passengerJson = JSON.stringify(passenger);

        const updateSeatStatus = (client, tableName, busIdColumn) => client.query(`
            UPDATE ${tableName} SET seats_id_layout = (
                SELECT jsonb_agg(
                    CASE 
                        WHEN seat->>'id' = ANY($2::text[]) 
                        THEN seat || jsonb_build_object('status', 'on_booking') 
                        ELSE seat 
                    END
                )
                FROM jsonb_array_elements(seats_id_layout) AS seat
            ) WHERE ${busIdColumn} = $1
        `, [bus_id, seatIds]);

        await Promise.all([
            updateSeatStatus(clientTbs, 'tbs_bus_info', 'bus_id'), 
            updateSeatStatus(clientabhi, 'live_data_details', '"Bus_id"'), 
        ]);

        const insertResult = await clientTbs.query(`
            INSERT INTO booking_details (departure_name, arrival_name, date, pickup, drop, passenger, email_id, mobile_number, bus_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id
        `, [departure_name, arrival_name, date, pickup, drop, passengerJson, email_id, mobile_number, bus_id]);

        const bookingId = insertResult.rows[0].id;

        setTimeout(async () => {
            const [clientTbs, clientabhi] = await Promise.all([
                tbsWebPool.connect(), abhiBusPool.connect()
            ]);

            try {
                const bookingResult = await clientTbs.query(
                    `SELECT price FROM booking_details WHERE id = $1`, [bookingId]
                );

                if (bookingResult.rows.length === 0) return;

                const currentPrice = bookingResult.rows[0].price;

                if (currentPrice === null) {
                    const updateSeatStatus = (client, tableName, busIdColumn) => client.query(`
                        UPDATE ${tableName} SET seats_id_layout = (
                            SELECT jsonb_agg(
                                CASE 
                                    WHEN seat->>'id' = ANY($1::text[]) 
                                    THEN seat || jsonb_build_object('status', 'AFA') 
                                    ELSE seat 
                                END
                            )
                            FROM jsonb_array_elements(seats_id_layout) AS seat
                        ) WHERE ${busIdColumn} = $2
                    `, [seatIds, bus_id]);

                    await Promise.all([
                        updateSeatStatus(clientTbs, 'tbs_bus_info', 'bus_id'),
                        updateSeatStatus(clientabhi, 'live_data_details', '"Bus_id"')
                    ]);
                }
            } catch (error) {
                console.error('Error updating seat status after timeout:', error);
            } finally {
                clientTbs.release();
                clientabhi.release();
            }
        },7 * 60 * 1000);

        await Promise.all([clientTbs.query('COMMIT'), clientabhi.query('COMMIT')]);

        res.status(201).json({ status: 'success', message: 'Booking created successfully', bookingId });
    } catch (error) {
        await Promise.all([clientTbs.query('ROLLBACK'), clientabhi.query('ROLLBACK')]);
        res.status(error.status || 500).json({ status: 'error', message: error.message || 'Internal Server Error' });
    } finally {
        [clientTbs, clientabhi].forEach(client => client.release());
    }
};

  
//PUT API OF BOOKING DETAILS
const putBookingDetails = async (req, res) => {
    const id = req.params.id
    const { departure_name, arrival_name, date, pickup, drop, passenger, email_id, mobile_number, bus_id } = req.body
  
    if (!departure_name || !arrival_name || !date || !pickup || !drop || !passenger ||!email_id ||!mobile_number) {
        return res.status(207).json({ message: 'All fields are required' })
    }
  
    try {
        const query = `
        UPDATE booking_details 
        SET departure_name = $1, arrival_name = $2, date = $3, pickup = $4, drop = $5, passenger = $6, email_id = $7, mobile_number = $8, bus_id = $9
        WHERE id = $10
        RETURNING *;`
        const values = [departure_name, arrival_name, date, pickup, drop, JSON.stringify(passenger), email_id, mobile_number, bus_id, id];
  
        const result = await tbsWebPool.query(query, values);
  
        res.status(201).json({
            status: 'success',
            data: 'created',
        })
    } catch (error) {
        console.error('Error updating booking details:', error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' })
    }
}
  
//GET API OF BOOKING DETAILS
const Getbooking = async (req, res) => {
    const mobNum = req.params.mobile_number
    try {
        const result = await tbsWebPool.query(`SELECT * FROM booking_details WHERE mobile_number = $1`, [mobNum])
        res.status(200).json(result.rows)
    } catch (error) {
      console.error('Error geting booking details:', error);
      res.status(500).json({ status: 'error', message: 'Internal Server Error' })
    }
}

//PUT API FOR PNR AND TICKET NUMBER GENERATION
const generateTicketNumber = () => {
    const randomNumbers = Math.floor(Math.random() * 1e12).toString().padStart(9, '0');
    return `TBS${randomNumbers}`;
};

const putPrice = async (req, res) => {
    const id = req.params.id;
    const { price, bus_id, seat, status, offers_rewards } = req.body;

    if (!price || !bus_id || !seat || !status) {
        return res.status(400).json({ error: 'Price, bus_id, seat, and status are required' });
    }

    const ticketNumber = generateTicketNumber();

    const [clientTbs, clientabhi] = await Promise.all([
        tbsWebPool.connect(), abhiBusPool.connect()
    ]);

    try {
        await Promise.all([clientTbs.query('BEGIN'), clientabhi.query('BEGIN')]);

        const updateSeatStatus = async (client, tableName, busIdColumn) => {
            for (let i = 0; i < seat.length; i++) {
                const updateResult = await client.query(`
                    UPDATE ${tableName} SET seats_id_layout = (
                        SELECT jsonb_agg(
                            CASE
                                WHEN seat->>'id' = $2 THEN seat || jsonb_build_object('status', $3::text)
                                ELSE seat
                            END
                        )
                        FROM jsonb_array_elements(seats_id_layout) AS seat
                    ) WHERE ${busIdColumn} = $1 RETURNING seats_id_layout;`, [bus_id, seat[i], status[i]]);

                if (updateResult.rowCount === 0) {
                    throw new Error(`Seat ${seat[i]} not found in ${tableName}`);
                }
            }
        };

        await Promise.all([
            updateSeatStatus(clientTbs, 'tbs_bus_info', 'bus_id'), 
            updateSeatStatus(clientabhi, 'live_data_details', '"Bus_id"')
        ]);

        const bookingResult = await tbsWebPool.query(
            `UPDATE booking_details
             SET "Booking_Id" = $1, price = $2, offers_rewards = $3
             WHERE id = $4
             RETURNING departure_name, arrival_name, date AS travel_date, pickup, drop, passenger, email_id, mobile_number, "TBS_Partner_PNR_No", "Booking_Id", bus_id`,
            [ticketNumber, price, offers_rewards, id]);

        if (bookingResult.rowCount === 0) {
            throw new Error(`Booking details with id ${id} not found`);
        }

        const bookingDetails = bookingResult.rows[0];

        await tbsWebPool.query(
            `INSERT INTO passenger_profile (email_id, mobile_number, user_name)
            VALUES ($1, $2, 'user')
            ON CONFLICT (email_id, mobile_number)
            DO UPDATE SET 
                email_id = EXCLUDED.email_id, 
                mobile_number = EXCLUDED.mobile_number;`, 
            [bookingDetails.email_id, bookingDetails.mobile_number]
        );

        const busResult = await clientTbs.query(
            `SELECT 
                operator_name, 
                departure_date_time, 
                arrival_date_time, 
                bus_type, 
                time_duration, 
                seats_id_layout, 
                boarding, 
                dropping
            FROM 
                tbs_bus_info
            WHERE bus_id = $1`,
            [bus_id]
        );
        
        if (busResult.rowCount === 0) {
            throw new Error(`Bus details with bus_id ${bus_id} not found`);
        }
        
        const busDetails = busResult.rows[0];
        
        const findTimeByLocation = (locations, locationName) => {
            const location = locations.find(loc => loc.name === locationName);
            return location ? location.time : null;
        };

        const extractTime = (timestamp) => {
            if (!timestamp) return null;
            return new Date(timestamp);
        };

        const formatTo24Hour = (date) => {
            const hours = date.getHours();
            const minutes = date.getMinutes();
            const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes; 
            return `${hours}:${formattedMinutes}`;
        };        
        
        const formatDate = (date) => {
            const options = { day: 'numeric', month: 'short', year: 'numeric' };
            return date.toLocaleDateString('en-US', options);
        };

        const boardingTime = findTimeByLocation(busDetails.boarding, bookingDetails.pickup);
        const droppingTime = findTimeByLocation(busDetails.dropping, bookingDetails.drop);

        const boardingTimeOnly = formatTo24Hour(extractTime(boardingTime));
        const droppingTimeOnly = formatTo24Hour(extractTime(droppingTime));

        if (!boardingTimeOnly || !droppingTimeOnly) {
            throw new Error('Boarding or Dropping point time not found');
        }

        const travelDate = extractTime(bookingDetails.travel_date);
        const formattedTravelDate = `${formatDate(travelDate)} ${formatTo24Hour(travelDate)}`;

        await tbsWebPool.query(
            `INSERT INTO ticket_details 
            ("TBS_Partner_PNR_No", "Booking_Id", arrival_date, departure_date, arrival_time, departure_time, arrival_name, duration, departure_name, "Pickup_Point_and_Time", operator_name, "Dropping_Point_Time", "Bus_Type", mobile_number, passenger, email_id, status, status_id, bus_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
            [
                bookingDetails["TBS_Partner_PNR_No"], 
                bookingDetails["Booking_Id"], 
                bookingDetails.travel_date, 
                bookingDetails.travel_date, 
                boardingTimeOnly, 
                droppingTimeOnly, 
                bookingDetails.arrival_name, 
                busDetails.time_duration, 
                bookingDetails.departure_name, 
                `${bookingDetails.pickup} (${boardingTimeOnly})`,  
                busDetails.operator_name,
                `${bookingDetails.drop} (${droppingTimeOnly})`,  
                busDetails.bus_type,
                bookingDetails.mobile_number, 
                JSON.stringify(bookingDetails.passenger), 
                bookingDetails.email_id, 
                'upcoming', 
                0,
                bus_id
            ]
        )

        await sendBookingConfirmationEmail(bookingDetails.email_id, {
            passenger: bookingDetails.passenger,
            departure_name: bookingDetails.departure_name,
            arrival_name: bookingDetails.arrival_name,
            booking_id: bookingDetails.Booking_Id,
            boarding_point: `${bookingDetails.pickup} (${boardingTimeOnly})`,  
            dropping_point: `${bookingDetails.drop} (${droppingTimeOnly})`,  
            departure_time: `${boardingTimeOnly}`,
            reporting_time: 'before 15 minutes',
            price: price,
            travel_date: formattedTravelDate, 
            travel_time: busDetails.time_duration,
            operator_name: busDetails.operator_name
        });

        await Promise.all([clientTbs.query('COMMIT'), clientabhi.query('COMMIT')]);

        return res.status(200).json({ message: 'Booking Id generated and status updated successfully', Booking_Id: bookingDetails.Booking_Id });
    } catch (error) {
        await Promise.all([clientTbs.query('ROLLBACK'), clientabhi.query('ROLLBACK')]);
        console.error('Error generating Booking Id:', error);
        return res.status(500).json({ error: 'Internal Server Error' });
    } finally {
        [clientTbs, clientabhi].forEach(client => client.release());
    }
}

const sendBookingConfirmationEmail = async (email_id, { passenger = [], departure_name, arrival_name, booking_id, boarding_point, dropping_point, price, travel_date, operator_name, travel_time }) => {
    const passengerDetails = Array.isArray(passenger) && passenger.length > 0 
    ? `
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="background-color: #1F487C; color: white;">
                    <th style="border: 1px solid #1F487C; padding: 10px; text-align: left;">Name</th>
                    <th style="border: 1px solid #1F487C; padding: 10px; text-align: left;">Age</th>
                    <th style="border: 1px solid #1F487C; padding: 10px; text-align: left;">Gender</th>
                    <th style="border: 1px solid #1F487C; padding: 10px; text-align: left;">Seat</th>
                </tr>
            </thead>
            <tbody>
                ${passenger.map((p) => `
                    <tr>
                        <td style="border: 1px solid #1F487C; padding: 10px; text-align: left;">${p.user_name}</td>
                        <td style="border: 1px solid #1F487C; padding: 10px; text-align: left;">${p.age}</td>
                        <td style="border: 1px solid #1F487C; padding: 10px; text-align: left;">${p.gender}</td>
                        <td style="border: 1px solid #1F487C; padding: 10px; text-align: left;">${p.seat}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    ` 
    : '<div style="text-align: left;">No passengers found</div>';

    const transporter = nodemailer.createTransport({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        auth: {
            user: 'tickets@thebusstand.com',
            pass: 'vtqrjmznhnghjrst', 
        },
    });

    const mailOptions = {
        from: '"The Bus Stand" <tickets@thebusstand.com>',
        to: email_id,
        subject: `Booking Confirmation - ${booking_id}`,
        html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Booking Confirmation</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
                .container { max-width: 500px; margin: 0 auto; padding: 15px; }
                .header { background-color: #1F487C; padding: 10px; border-radius: 10px 10px 0 0; text-align: center; color: #fff; }
                .header a { color: #FFFFFF; font-size: 22px; font-weight: 600; margin: 0; text-decoration: none; }
                .details { padding: 20px; background-color: #ffffff; text-align: left; border: 3px solid #1F487C; border-radius: 0 0 10px 10px; }
                .footer { padding: 10px; background-color: #D2DAE5; text-align: center; border-radius: 0 0 10px 10px; }
                .highlight { color: #1F487C; font-weight: bold; }
            </style>
        </head>
        <body>
        <p style="font-size: 16px; color: #1F487C; margin-bottom: 15px;">
                Dear ${passenger.length > 0 ? passenger[0].user_name : 'Passenger'}, your booking has been confirmed.
            </p> <br>
            <div class="container">
                <div class="header">
                    <a href="www.redbus.in">THEBUSSTAND.COM</a>
                </div>
                <div class="details">
                    <h3 class="highlight">TBSBus eTicket - ${booking_id}</h3>
                    <p class="highlight">${departure_name} ➔ ${arrival_name}</p>
                    <p class="highlight">${travel_date}</p>
                    <p style="font-size: 16px; color: #1F487C; margin-bottom: 10px;">
                        Bus Operator: ${operator_name}
                    </p>
                    <p style="font-size: 16px; color: #1F487C; margin-bottom: 10px;">
                        Travel Time: ${travel_time}
                    </p>
                    <p style="font-size: 16px; color: #1F487C; margin-bottom: 10px;">
                        Boarding Point: ${boarding_point}
                    </p>
                    <p style="font-size: 16px; color: #1F487C; margin-bottom: 10px;">
                        Dropping Point: ${dropping_point}
                    </p>
                    <h3>Passenger Details:</h3>
                    <div style="font-size: 16px; color: #1F487C; font-weight: 900; background-color: #D2DAE5; border-radius: 10px; padding: 8px 15px; margin-bottom: 10px;">
                        ${passengerDetails}
                    </div>
                    <div style="text-align: right;">
                        <p class="highlight">Total Fare: ₹${price}</p>
                    </div>
                </div>
                <div class="footer">
                    <p style="font-size: 12px; color: #999; margin: 0;">
                        This email was sent by TheBusStand tickets.
                    </p>
                    <p style="font-size: 12px; color: #999; margin: 5px 0 0 0;">
                        © 2024 TheBusStand. All rights reserved.
                    </p>
                </div>
            </div>
        </body>
    </html> `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully to:', email_id);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

module.exports = {
    putPrice
};


module.exports = { Getbooking, putBookingDetails, bookingDetails, putPrice }