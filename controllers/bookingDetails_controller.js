const { tbsWebPool, abhiBusPool } = require('../config/dbconfig');
const crypto = require('crypto')
const nodemailer = require('nodemailer')
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

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
        }, 7 * 60 * 1000);

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

    if (!departure_name || !arrival_name || !date || !pickup || !drop || !passenger || !email_id || !mobile_number) {
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
    console.log(id);
    console.log(req.body);
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

        const data = await tbsWebPool.query(`SELECT email_id FROM passenger_profile WHERE email_id = $1`, [bookingDetails.email_id])
        const passenger = data.rows[0]
        const value = passenger === undefined ? null : data.rows[0].email_id
        if (value === null) {
            await tbsWebPool.query(
                `INSERT INTO passenger_profile (email_id, mobile_number, user_name)
              VALUES ($1, $2, 'user')
              ON CONFLICT (email_id, mobile_number)
              DO UPDATE SET 
                  email_id = EXCLUDED.email_id, 
                  mobile_number = EXCLUDED.mobile_number;`,
                [bookingDetails.email_id, bookingDetails.mobile_number]
            );
        }


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
            Booking_Id: bookingDetails.Booking_Id,
            Pickup_Point_and_Time: `${bookingDetails.pickup} (${boardingTimeOnly})`,
            Dropping_Point_Time: `${bookingDetails.drop} (${droppingTimeOnly})`,
            departureTime: `${boardingTimeOnly}`,
            arrivalTime: `${droppingTimeOnly}`,
            price: price,
            arrivaldate: formattedTravelDate,
            departuredate: formattedTravelDate,
            duration: busDetails.time_duration,
            operator_name: busDetails.operator_name,
            Bus_Type: busDetails.bus_type,
            mobile_number: bookingDetails.mobile_number,
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



const sendBookingConfirmationEmail = async (
    email_id, { passenger = [],
        departure_name,
        arrival_name,
        Booking_Id,
        Pickup_Point_and_Time,
        Dropping_Point_Time,
        departureTime,
        arrivalTime,
        price,
        arrivaldate,
        departuredate,
        duration,
        operator_name,
        Bus_Type,
        mobile_number,
    }
) => {
    const passengerDetails = Array.isArray(passenger) && passenger.length > 0
        ? `
  ${passenger.map((passenger) => `
    <div style="display :flex; justify-content: space-between; width: 100%;">
                        <div style="padding-left: 10px; line-height: 0.2;width: 100%; text-align: left; ">
                            <p style="font-weight: 600; font-size: 16px;">${passenger.user_name}</p>
                        </div>
                        <div style="padding-right: 20px; line-height: 0.2;width: 100%; text-align: left;">
                            <p style="font-weight: 600; font-size: 16px;">${passenger.age} & ${passenger.gender}</p>
                        </div>
                        <div style="padding-right: 20px; line-height: 0.2;width: 30%; text-align: left;">
                            <p style="font-weight: 600; font-size: 16px;">${passenger.seat}</p>
                        </div>
                    </div>
`).join('')}
      
  `
        : '<div style="text-align: left;">No passengers found</div>';

    const operatorname = operator_name.toUpperCase();
    const image = await tbsWebPool.query(`SELECT logos FROM operators_logo WHERE "operator_name" = $1`, [operatorname]);
    const logo = image.rows.length > 0 ? `http://192.168.90.47:4001${image.rows[0]?.logos}` : 'logo';
    const options = { day: '2-digit', month: 'short' };
    const departure = new Date(departuredate).toLocaleDateString('en-GB', { ...options })
    const arrival = new Date(arrivaldate).toLocaleDateString('en-GB', { ...options })
    const areaShortform = await tbsWebPool.query(
        'SELECT * FROM public.state_district_code WHERE state_district_name = $1',
        [departure_name]
    );
    const Shortform = await tbsWebPool.query(
        'SELECT * FROM public.state_district_code WHERE state_district_name = $1',
        [arrival_name]
    );

    const departurename = areaShortform.rows[0]?.short_form;
    const arrivalname = Shortform.rows[0]?.short_form

    const regularTickets = `
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>


</head>

<body style="font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #E6F4FF;
            text-align: center; ">
    <div style="width: 100%; height: auto; text-align: center;">
        <div style="width: 100%; height: auto; padding: 5px; text-align: center; ">
            <p class="container" style="color: #1F487C; font-weight: 600; font-size: 27.5px; line-height: 33.16px;">
                Confirmation of Your
                Ticket Purchase</p>
        </div>
        <div
            style="background-color: #FFFFFF; width: 98%; height: auto; padding: 5px; text-align: center;  overflow-x: hidden;">
            <p style="color: #585858; font-weight: 600; font-size: 30px; line-height: 19.52px;">Hi ${passenger.length > 0 ? passenger[0].user_name : 'Passenger'}</p>
            <p style="color: #1F487C; font-size: 26px; font-weight: 600; line-height: 20px;">Your booking has been
                confirmed</p>
            <p style="font-size: 22px; font-weight: 600; line-height: 20px; color:#929292;">Thank you for choosing
                us,<br>we hope that have a safe journey!</p>
        </div>
        <div style="width: 100%; height: auto; padding: 5px;">
            <p style="font-size: 18px; font-weight: 600; line-height:14.28px; color:#656B70;">Following are the
                completed
                details of your booking.</p>
            <p style="font-size: 20px; font-weight: 600; line-height: 31.32px; color: #316C92;">Your eTicket Number:
                <br><span style="font-weight: 400; font-size: 24px; line-height: 31.32px">${Booking_Id}</span>
            </p>
        </div>

        <div style="width: 100%; text-align: center;">
            <div style="max-width: 365px; height: auto; display: inline-block; ">
                <div
                    style="width: 361px; height: auto; background-color: #1F487C; border: 2px solid #1F487C; border-top-left-radius: 10px; border-top-right-radius: 10px; text-align: center;">
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px;">
                        <div style="padding: 5px ; width: 100%;">
                            <p style="font-size: 36px; font-weight: 900;line-height: 1.38px; color: #FFFFFF;">${departurename}
                            </p>
                            <p style="font-size: 14.67px; font-weight: 600; line-height: 0.75px; color: #FFFFFF;">
                               ${departure}</p>
                        </div>
                        <div
                            style="width: 100%; display: flex; align-items: center; justify-content: center; margin-top: 20px; ">
                            <div class="dashed-line-hr"
                                style="border-top: 3px dashed #FFFFFF; width: 98%;margin-top: 22px;"></div>
                            <p style="margin-top: 5px;font-size:20px; color:#FFFFFF;  margin-top: 9px; ">></p>
                        </div>
                        <div style="padding: 5px;  width: 100%;">
                            <p style="font-size: 36px; font-weight: 900;line-height: 1.38px; color: #FFFFFF;">${arrivalname}
                            </p>
                            <p style="font-size: 14.67px; font-weight: 600;color: #FFFFFF; line-height: 0.75px;">
                               ${arrival}
                            </p>
                        </div>
                    </div>
                    <p style="font-weight: 400; font-size: 18.86px; color: #FFFFFF;  line-height: 0.75px;">Ticket
                        Number
                        :${Booking_Id}</p>
                    <p style="font-weight: 400; font-size: 18.86px; color: #FFFFFF;  line-height: 17.75px;">PNR :
                        353450230-1123</p>
                </div>
                <div
                    style="width: 99%; height: auto; border-left: 2px solid #1F487C;  border-right: 2px solid #1F487C; text-align: center; background: #FFFFFF;">
                    <div
                        style="width: 100%; height: auto; display: flex; justify-content: center; align-items: center; ">
                        <div style="width: 13%; margin-top: 7px; text-align: right; padding: 5px">
                            <img src="" alt=""
                                style="width: 34px; height: 34px; object-fit: cover; border-radius: 50%; ">
                        </div>
                        <p style="font-size: 17px; font-weight: 600; width: 100%; text-align: center;">${operator_name}</p>
                    </div>
                    <p style="font-weight: 400;font-size: 16px;line-height: 0.36px; margin-top: -3px; ">2+1 AC
                        Sleeper
                    </p>
                    <div style=" display: flex; align-items: center; width: 100%; justify-content: center;">
                        <div style=" height: auto; width: 100%; text-align: left; padding: 5px ;">
                            <p style="font-weight: 600;font-size: 16px;line-height:10.36px; ">
                                ${departure_name}
                            </p>
                            <p style="color: #393939; font-weight: 400; font-size: 16px; line-height:10.36px;">
                                 ${departure}
                            </p>
                            <p style="font-weight: 700; color: #393939; font-size: 16px; line-height: 10.36px; ">
                                ${departureTime}
                            </p>
                        </div>
                        <div class="bus-graphics"
                            style="display: flex; align-items: center; justify-content: center; width: 50%; margin-top: 30px;  ">
                            <div class="circle" style="
                                                    width: 3px;
                                                    height: 3px;
                                                    border-radius: 100%;
                                                    background-color: #244c7e;
                                                    padding: 1px;
                                                    margin-top: 20px;
                                                "></div>
                            <div class="dashed-line-hr"
                                style="border-top: 2px dashed #244c7e; width: 25px; margin-top: 22px;"></div>

                           <div
                            style="
                              border: 2px solid #244c7e ;
                              color: #244c7e;
                                width: 60px;
                              height: 20px;
                              border-radius: 50px;
                              font-size: 14px;
                              font-weight: 600;
                              text-align: center;
                              padding: 1px;
                              margin-top: 10px;
                            "
                            >
                           ${duration}
                          </div>
                         


                            <div class="dashed-line-hr"
                                style="border-top: 2px dashed #244c7e; width: 25px; margin-top: 22px;"></div>
                            <p style="margin-top: 11px; font-size:18px; color:#244c7e; ">></p>
                        </div>
                        <div style=" height: auto; width:100%; text-align: right; padding: 5px;">
                            <p style="font-weight: 600;font-size: 16px;line-height: 10.36px;">
                                ${arrival_name}
                            </p>
                            <p style="color: #393939; font-weight: 400; font-size: 16px; line-height: 10.36px;">
                               ${arrival}
                            </p>
                            <p style="font-weight: 700; color: #393939; font-size: 16px; line-height: 10.36px;">
                                ${arrivalTime}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="separater" style="display: flex; align-items: center; background: #FFFFFF;">
                    <div class="left-cricle" style="
                                width: 10px;
                                height: 20px;
                                color: white;
                                border: 2px solid #244c7e;
                                border-radius: 0 75px 75px 0;
                                border-left: none;
                                background: #E6F4FF;
                                ;
                            "></div>
                    <div class="dashed-line-separater-hr"
                        style="border-top: 2px dashed #244c7e; width: 100%;  margin-top: 10px;"></div>
                    <div class="right-cricle" style="
                                    width: 11px;
                                    height: 20px;
                                    border: 2px solid #244c7e;
                                    border-radius: 75px 0 0 75px;
                                    border-right: none;
                                    background: #E6F4FF;
                                  "></div>
                </div>
                <div
                    style="width: 99%; height: auto; border-left: 2px solid #1F487C;  border-right: 2px solid #1F487C; background: #FFFFFF;">
                    <div style="display :flex; justify-content: space-between; width: 100%;">
                        <div style="padding-left: 10px; line-height: 0.2;width: 100%; text-align: left; ">
                            <p style="font-weight: 400; font-size: 15px; ">Name</p>

                        </div>
                        <div style="padding-right: 20px; line-height: 0.2;width: 100%; text-align: left;">
                            <p style="font-weight: 400; font-size: 15px; ">Age & Gender</p>

                        </div>
                        <div style="padding-right: 20px; line-height: 0.2;width: 30%; text-align: left;">
                            <p style="font-weight: 400; font-size: 15px; ">Seat</p>

                        </div>
                    </div>
                    ${passengerDetails}
                </div>
                <div class="separater" style="display: flex; align-items: center; background-color: #FFFFFF;">
                    <div class="left-cricle" style="
                                width: 10px;
                                height: 20px;
                                color: white;
                                border: 2px solid #244c7e;
                                border-radius: 0 75px 75px 0;
                                border-left: none;
                                background: #E6F4FF;
                            "></div>
                    <div class="dashed-line-separater-hr"
                        style="border-top: 2px dashed #244c7e; width: 100%;  margin-top: 10px;"></div>
                    <div class="right-cricle" style="
                                    width: 11px;
                                    height: 20px;
                                    border: 2px solid #244c7e;
                                    border-radius: 75px 0 0 75px;
                                    border-right: none;
                                    background: #E6F4FF;
                                  "></div>
                </div>

                <div
                    style="width: 99.1%; height: auto; background-color: #FFFFFF; border-right: 2px solid #1F487C;  border-left: 2px solid #1F487C; ">
                    <div style="width: 100%; height: 90px; display: flex; align-items: center;">
                        <div style="width: 100%; text-align: center;">
                            <div style="width: 100%; text-align: center;">
                                <p style="font-weight: 800;font-size: 26.18px; width: 135px;
                                height: 35px;
                                background-color: #244c7e;
                                color: white;
                                border-radius: 5px;
                                margin-left: 40px;
                                padding: 5px;
                                ">
                                    ${price}
                                </p>
                            </div>
                            
                        </div>
                        <div style="width: 40%; height: auto;">
                            <div
                                style="width: 60px; height: 60px; background-color: #1F487C66; border-radius: 50%;  padding: 7px;">
                                <div
                                    style=" background-color: #1F487C; border-radius: 50%; width: 50px; height: 50px; padding: 5px;">
                                    <a href=""
                                        style="font-size: 40px; font-weight: 800; color: #FFFFFF; text-decoration: none; text-align: center;">
                                        ⭳
                                    </a>
                                       
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div
                style="width: 99%; height: auto; border: 2px solid #1F487C; border-radius: 0 0 10px 10px ; border-top: none;  background-color: #1F487C; text-align: center; border-top: 2px dashed #FFFFFF;">
                <div style="padding: 1px;">
                    <p style=" font-size: 17px; font-weight: 600;  color: #FFFFFF;">
                        Thanks for booking..! Travel again
                    </p>
                </div>
            </div>

            </div>
        </div>
    </div>

    <div
        style="width: 99%; height: 104.82px; text-align: center; padding: 5px; background-color: #1F487C; margin-top: 10px;">
        <p style="font-size: 18px; font-weight: 600; line-height: 17.75px; color: #FFFFFF;">We wish you a safe
            and pleasant journey!</p>
        <hr style="color:#FFFFFF;">
        <p style="font-size: 14px; font-weight: 400; color: #FFFFFF; line-height: 15px;">This email was sent by
            TheBusStand Support. <br> © 2025 TheBusStand. All rights reserved.</p>
    </div>
    </div>

</body>

</html>
`
    const luxuryTickets = `
    
    <!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>


</head>

<body style="font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #FDEFCB;
            text-align: center; ">
    <div style="width: 100%; height: auto; text-align: center;">
        <div style="width: 100%; height: auto; padding: 5px; text-align: center; ">
            <p class="container" style="color: #D89E2F; font-weight: 600; font-size: 27.5px; line-height: 33.16px;">
                Confirmation of Your
                Ticket Purchase</p>
        </div>
        <div
            style="background-color: #FFFFFF; width: 98%; height: auto; padding: 5px; text-align: center;  overflow-x: hidden;">
            <p style="color: #585858; font-weight: 600; font-size: 30px; line-height: 19.52px;">Hi ${passenger.length > 0 ? passenger[0].user_name : 'Passenger'}</p>
            <p style="color: #D89E2F; font-size: 26px; font-weight: 600; line-height: 20px;">Your booking has been
                confirmed</p>
            <p style="font-size: 22px; font-weight: 600; line-height: 30px; color:#929292;">Thank you for choosing
                us,<br>we hope that have a safe journey!</p>
        </div>
        <div style="width: 100%; height: auto; padding: 5px;">
            <p style="font-size: 18px; font-weight: 600; line-height:14.28px; color:#656B70;">Following are the
                completed
                details of your booking.</p>
            <p style="font-size: 20px; font-weight: 600; line-height: 31.32px; color: #D89E2F;">Your eTicket Number:
                <br><span style="font-weight: 400; font-size: 24px; line-height: 31.32px">${Booking_Id}</span>
            </p>
        </div>

        <div style="width: 100%; text-align: center;">
            <div style="max-width: 365px; height: auto; display: inline-block; ">
                <div
                    style="width: 361px; height: auto; background: linear-gradient(135.34deg, #F6B642 15.43%, #FFF279 38.03%, #F6B642 57.93%, #FFDF71 69.97%, #FBE67B 86.26%);
                    border: 2px solid #D89E2F; border-top-left-radius: 10px; border-top-right-radius: 10px; text-align: center;">
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px;">
                        <div style="padding: 5px ; width: 100%;">
                            <p style="font-size: 36px; font-weight: 900;line-height: 1.38px; color: #141414;">${departurename}
                            </p>
                            <p style="font-size: 14.67px; font-weight: 600; line-height: 0.75px; color: #141414">
                                ${departure}</p>
                        </div>
                        <div
                            style="width: 100%; display: flex; align-items: center; justify-content: center; margin-top: 20px; ">
                            <div class="dashed-line-hr"
                                style="border-top: 3px dashed #141414; width: 98%;margin-top: 22px;"></div>
                            <p style="margin-top: 5px;font-size:20px; color:#141414;  margin-top: 9px; ">></p>
                        </div>
                        <div style="padding: 5px;  width: 100%;">
                            <p style="font-size: 36px; font-weight: 900;line-height: 1.38px; color: #141414;">${arrivalname}
                            </p>
                            <p style="font-size: 14.67px; font-weight: 600;color: #141414; line-height: 0.75px;">
                                ${arrival}
                            </p>
                        </div>
                    </div>
                    <p style="font-weight: 400; font-size: 18.86px; color: #141414;  line-height: 0.75px;">Ticket
                        Number
                        :${Booking_Id}</p>
                    <p style="font-weight: 400; font-size: 18.86px; color: #141414;  line-height: 17.75px;">PNR :
                        353450230-1123</p>
                </div>
                <div
                    style="width: 99%; height: auto; border-left: 2px solid #D89E2F;  border-right: 2px solid #D89E2F; text-align: center; background: #FFFFFF;">
                    <div
                        style="width: 100%; height: auto; display:flex; justify-content:space-between; align-items: center;">
                        <div style="width: 40%; margin-top: 7px;">
                            <img src="" alt=""
                                style="width: 34px; height: 34px; object-fit: cover; border-radius: 50%; ">
                        </div>
                        <p style="font-size: 17px; font-weight: 600; width: 100%; text-align: left; width: 100%;">${operator_name}
                            </p>
                    </div>
                    <p style="font-weight: 400;font-size: 16px; line-height: 0.36px; margin-top: -3px; ">2+1 AC
                        Sleeper
                    </p>
                    <div style=" display: flex; align-items: center; width: 100%; justify-content: center;">
                        <div style=" height: auto; width: 100%; text-align: left; padding: 5px ;">
                            <p style="font-weight: 600;font-size: 16px;line-height:10.36px; ">
                                ${departure_name}
                            </p>
                            <p style="color: #393939; font-weight: 400; font-size: 16px; line-height:10.36px;">
                                ${departure}
                            </p>
                            <p style="font-weight: 700; color: #393939; font-size: 16px; line-height: 10.36px; ">
                                ${departureTime}
                            </p>
                        </div>
                        <div class="bus-graphics"
                            style="display: flex; align-items: center; justify-content: center; width: 50%; margin-top: 30px;  ">
                            <div class="circle" style="
                                                    width: 3px;
                                                    height: 3px;
                                                    border-radius: 100%;
                                                    background-color: #D89E2F;
                                                    padding: 1px;
                                                    margin-top: 20px;
                                                "></div>
                            <div class="dashed-line-hr"
                                style="border-top: 2px dashed #D89E2F; width: 25px; margin-top: 22px;"></div>

                           <div
                            style="
                              border: 2px solid #D89E2F ;
                              color: #D89E2F;
                              width: 60px;
                              height: 20px;
                              border-radius: 50px;
                              font-size: 14px;
                              font-weight: 600;
                              text-align: center;
                              padding: 1px;
                              margin-top: 10px;
                            "
                            >
                           ${duration}
                          </div>
                         


                            <div class="dashed-line-hr"
                                style="border-top: 2px dashed #D89E2F; width: 25px;margin-top: 22px;"></div>
                            <p style="margin-top: 11px; font-size:18px; color:#D89E2F; ">></p>
                        </div>
                        <div style=" height: auto; width:100%; text-align: right; padding: 5px;">
                            <p style="font-weight: 600;font-size: 16px;line-height: 10.36px;">
                               ${arrival_name}
                            <p style="color: #393939; font-weight: 400; font-size: 16px; line-height: 10.36px;">
                                ${arrival}
                            </p>
                            <p style="font-weight: 700; color: #393939; font-size: 16px; line-height: 10.36px;">
                                ${arrivalTime}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="separater" style="display: flex; align-items: center; background: #FFFFFF;">
                    <div class="left-cricle" style="
                                width: 10px;
                                height: 20px;
                                color: white;
                                border: 2px solid #D89E2F;
                                border-radius: 0 75px 75px 0;
                                border-left: none;
                                background: #FDEFCB;
                                ;
                            "></div>
                    <div class="dashed-line-separater-hr"
                        style="border-top: 2px dashed #393939; width: 100%;  margin-top: 10px;"></div>
                    <div class="right-cricle" style="
                                    width: 11px;
                                    height: 20px;
                                    border: 2px solid #D89E2F;
                                    border-radius: 75px 0 0 75px;
                                    border-right: none;
                                    background: #FDEFCB;
                                  "></div>
                </div>
                <div
                    style="width: 99%; height: auto; border-left: 2px solid #D89E2F;  border-right: 2px solid #D89E2F; background: #FFFFFF;">
                    <div style="display :flex; justify-content: space-between; width: 100%;">
                        <div style="padding-left: 10px; line-height: 0.2;width: 100%; text-align: left; ">
                            <p style="font-weight: 400; font-size: 15px; ">Name</p>

                        </div>
                        <div style="padding-right: 20px; line-height: 0.2;width: 100%; text-align: left;">
                            <p style="font-weight: 400; font-size: 15px; ">Age & Gender</p>

                        </div>
                        <div style="padding-right: 20px; line-height: 0.2;width: 30%; text-align: left;">
                            <p style="font-weight: 400; font-size: 15px; ">Seat</p>

                        </div>
                    </div>
                    ${passengerDetails}
                </div>
                <div class="separater" style="display: flex; align-items: center; background-color: #FFFFFF;">
                    <div class="left-cricle" style="
                                width: 10px;
                                height: 20px;
                                color: white;
                                border: 2px solid #D89E2F;
                                border-radius: 0 75px 75px 0;
                                border-left: none;
                                background: #FDEFCB;
                            "></div>
                    <div class="dashed-line-separater-hr"
                        style="border-top: 2px dashed #393939; width: 100%;  margin-top: 10px;"></div>
                    <div class="right-cricle" style="
                                    width: 11px;
                                    height: 20px;
                                    border: 2px solid #D89E2F;
                                    border-radius: 75px 0 0 75px;
                                    border-right: none;
                                    background: #FDEFCB;
                                  "></div>
                </div>

                <div
                    style="width: 99%; height: auto; background-color: #FFFFFF; border-right: 2px solid #D89E2F;  border-left: 2px solid #D89E2F; ">
                    <div style="width: 100%; height: 90px; display: flex; align-items: center;">
                        <div style="width: 100%; text-align: center;">
                            <div style="width: 100%; text-align: center;">
                                <p style="font-weight: 800;font-size: 26.18px; width: 135px;
                                height: 35px;
                                background-color: #D89E2F;
                                color: white;
                                border-radius: 5px;
                                margin-left: 40px;
                                padding: 5px;
                                margin-top: -10px;
                                ">
                                   ${price}
                                </p>
                            </div>
                            
                        </div>
                        <div style="width: 40%; height: auto;">
                            <div
                                style="width: 60px; height: 60px; background-color: #FFCF6E80; border-radius: 50%;  padding: 7px;">
                                <div
                                    style=" background-color: #D89E2F; border-radius: 50%; width: 50px; height: 50px; padding: 5px;">
                                    <a href=""
                                        style="font-size: 40px; font-weight: 800; color: #FFFFFF; text-decoration: none; text-align: center;">
                                        ⭳
                                    </a>
                                       
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div
                style="width: 99%; height: auto; border: 2px solid #D89E2F; border-radius: 0 0 10px 10px ; border-top: none;   background: linear-gradient(135.34deg, #F6B642 15.43%, #FFF279 38.03%, #F6B642 57.93%, #FFDF71 69.97%, #FBE67B 86.26%); text-align: center; border-top: 2px dashed #FFFFFF;">
                <div style="padding: 1px;">
                    <p style=" font-size: 17px; font-weight: 600;  color: #141414;">
                        Thanks for booking..! Travel again
                    </p>
                </div>
            </div>

            </div>
        </div>
    </div>

    <div
        style="width: 99%; height: 104.82px; text-align: center; padding: 5px; background-color: #D89E2F; margin-top: 10px;">
        <p style="font-size: 18px; font-weight: 600; line-height: 17.75px; color: #FFFFFF;">We wish you a safe
            and pleasant journey!</p>
        <hr style="color:#FFFFFF;">
        <p style="font-size: 14px; font-weight: 400; color: #FFFFFF; line-height: 15px;">This email was sent by
            TheBusStand Support. <br> © 2025 TheBusStand. All rights reserved.</p>
    </div>
    </div>

</body>

</html>
    `
    const busTypeStatus = (Bus_Type && typeof Bus_Type === 'string' &&
        (Bus_Type.toLowerCase().includes('luxury') ||
            Bus_Type.toLowerCase().includes('bharat benz') ||
            Bus_Type.toLowerCase().includes('volvo') ||
            Bus_Type.toLowerCase().includes('washroom')))
        ? "luxury"
        : "regular";
    console.log('busTypeStatus:', busTypeStatus);
    const template = busTypeStatus === 'luxury' ? luxuryTickets : regularTickets;
    const transporter = nodemailer.createTransport({
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        auth: {
            user: 'tickets@thebusstand.com',
            pass: 'smxhcrbcpftfwgcy',
        },
    });

    const mailOptions = {
        from: '"The Bus Stand" <tickets@thebusstand.com>',
        to: email_id,
        subject: `Booking Confirmation - ${Booking_Id}`,
        html: template,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully to:', email_id);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

const downloadticket = async (req, res) => {
    const id = req.params.Booking_Id
    try {
        const { rows } = await tbsWebPool.query('SELECT * FROM ticket_details WHERE "Booking_Id" = $1', [id]);

        const {
            Booking_Id,
            arrival_date,
            departure_date,
            arrival_time,
            departure_time,
            arrival_name,
            duration,
            departure_name,
            Pickup_Point_and_Time,
            operator_name,
            Dropping_Point_Time,
            Bus_Type,
            mobile_number,
            passenger,
            email_id,
        } = rows[0];

        const bus_rate = await tbsWebPool.query(`SELECT price FROM booking_details WHERE "Booking_Id" = $1`, [Booking_Id]);
        const { price } = bus_rate.rows[0];
        const rate = price.split('.')[0];
        const operatorname = operator_name.toUpperCase();
        const image = await tbsWebPool.query(`SELECT logos FROM operators_logo WHERE "operator_name" = $1`, [operatorname]);
        const logo = image.rows.length > 0 ? `http://192.168.90.47:4001${image.rows[0].logos}` : 'logo'
        const options = { day: '2-digit', month: 'short' };
        const departureDate = new Date(departure_date).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' }).replace(' ', '-');
        const arrivalDate = new Date(arrival_date).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' }).replace(' ', '-');
        const departureTime = departure_time.split(':').slice(0, 2).join('.');
        const arrivalTime = arrival_time.split(':').slice(0, 2).join('.');

        const htmlContent = `
       <!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ticket</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap');

        body {
            font-family: Arial, sans-serif;
            margin: 50px;
            display: flex;
            justify-content: center;

        }

        .outer-border {
            width: 60%;
            height: auto;
            border: solid gainsboro 2px;
            border-radius: 20px;
            overflow: hidden;
        }

        .bus-booking-id {
            width: auto;
            height: 50px;
            background-color: #244c7e;
            padding: 5px 20px 5px 10px;
            border-top-left-radius: 19px;
            border-top-right-radius: 19px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .booking-id {
            color: white;
            font-weight: bold;
        }

        .ticket-details {
            width: auto;
            height: auto;
            display: flex;
            justify-content: space-between;
            align-items: start;
            padding: 30px;
        }

        .logo {
            height: 100px;
            width: 100px;
            align-content: center;
            border-radius: 100%;
            object-fit: contain;
            box-shadow: 0px 10px 20px rgba(0, 0, 0, 0.2);
            margin-left: 40px;
        }

        .dashed-line {
            width: 2px;
            height: 100px;
            background: repeating-linear-gradient(to bottom, #244c7e 0px, #244c7e 8px, transparent 5px, transparent 10px);
        }

        .circle {
            width: 10px;
            height: 10px;
            border-radius: 100%;
            background-color: #244c7e;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1px;
        }

        .inner-circle {
            width: 7px;
            height: 7px;
            border-radius: 100%;
            background-color: #fff;
        }

        .bus-line {
            display: flex;
            flex-direction: column;
            justify-content: end;
            align-items: center;
            margin-top: 10px;
        }

        .travels-name {
            height: 250px;
            width: 30%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: start;
        }

        .dashed-line-hr {
            border-top: 2px dashed #000;
            width: 100px;
        }

        .bus-graphics {
            display: flex;
            align-items: center;
        }

        .bus {
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            background-color: #244c7e;
            color: white;
            width: 85px;
            height: 34px;
            border-top-left-radius: 7px;
            border-top-right-radius: 7px;
            border-bottom-left-radius: 3px;
            border-bottom-right-radius: 3px;
            font-size: 16px;
            font-weight: 600;
        }

        .circle-one {
            position: absolute;
            bottom: -12px;
            width: 18px;
            height: 18px;
            background-color: #244c7e;
            border-radius: 50%;
            box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);
            left: 6px;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .circle-two {
            position: absolute;
            bottom: -12px;
            width: 18px;
            height: 18px;
            background-color: #244c7e;
            border-radius: 50%;
            box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);
            right: 6px;
            display: flex;
            justify-content: center;
            align-items: center;
        }

        .inner-circle-one {
            width: 10px;
            height: 10px;
            border-radius: 100%;
            background-color: #fff;
        }

        .bus-details-row-one {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .bus-details-row-two {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .bus-details-row-three {
            display: flex;
            justify-content: space-between;
            align-items: center;

        }

        p {
            line-height: 0.5
        }

        .bus-design {
            display: flex;
            width: 80%;
            height: auto;
            justify-content: center;
            align-items: center;
        }

        .bus-data {
            width: 100%;
            height: 270px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            padding-left: 10px;
        }

        .price {
            width: 80px;
            height: 20px;
            background-color: #244c7e;
            color: white;
            padding: 8px;
            display: flex;
            justify-content: center;
            align-items: center;
            border-radius: 5px;
        }

        .left-cricle {
            width: 40px;
            height: 40px;
            color: white;
            margin-left: -20px;
            border: 2px dashed #244c7e;
            border-radius: 0 75px 75px 0;
            border-left: none;
            background: transparent;
        }

        .separater {
            display: flex;
            align-items: center;
        }

        .dashed-line-separater-hr {
            border-top: 2px dashed #244c7e;
            width: 100%;
        }

        .right-cricle {
            width: 40px;
            height: 40px;
            border: 2px dashed #244c7e;
            border-radius: 75px 0 0 75px;
            border-right: none;
            background: transparent;
            margin-right: -20px;
        }

        .passenger-name {
            width: auto;
            height: 70px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-left: 10px;
            padding-right: 10px;

        }

        .name {
            width: 40%;
            padding-left: 5px;
            border: 1px solid #244c7e;
            border-radius: 10px;
            border-right: 5px solid #244c7e;
        }

        .age {
            width: 10%;
            padding-left: 2px;
            border: 1px solid #244c7e;
            text-align: center;
            border-radius: 10px;
            border-right: 5px solid #244c7e;

        }

        .gender {
            display: flex;
            align-items: center;
            width: 20%;
            border: 1px solid #244c7e;
            border-radius: 10px;
            justify-content: center;
            overflow: hidden;
        }

        .male {
            width: 50%;
            padding-left: 2px;
            border-right: 2px solid #244c7e;
            text-align: center;

        }

        .female {
            width: 50%;
            padding-left: 2px;
            text-align: center;
        }

        .passenger-contact-detalis {
            width: 100%;
            height: 70px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-left: 20px;
            padding-right: 20px;
            margin-top: -15px;
            gap: 50px;
        }

        .mail {
            width: 30%;
            margin-left: 100px;
            color: #244c7e;
            text-align: left;
            display: flex;
            justify-content: start;
            align-items: center;
            gap: 10px;
        }

        .number {
            width: 43%;
            padding-left: 5px;
            display: flex;
            justify-content: start;
            align-items: center;
            gap: 10px;
        }

        .country-code {
            width: 30%;
            border-right: 1px solid #244c7e;
            text-align: center;
            color: #244c7e
        }

        .phone {
            padding-left: 10px;
            color: #244c7e
        }

        .barcode {
            font-family: 'Libre Barcode 39', cursive;
            font-size: 80px;
            letter-spacing: -15px;
            color: #244c7e
        }

        .barcode-container {
            width: auto;
            height: auto;
            padding: 10px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
        }

        .barcode-number {
            font-size: 20px;
            margin-top: -25px;
            margin-bottom: 25px;
            color: #244c7e
        }

        .price-tag {
            font-size: x-large;
        }

        .contact {
            font-size: 23px;
            color: #244c7e;
            font-weight: 600;
            padding-left: 5px;
        }


        .list {
            width: 20%;
            display: flex;
            justify-content: space-between;
            align-items: center;

        }

        .names,
        .ages,
        .genders {
            font-size: 18px;
            color: #244c7e;
            text-align: right;
        }

        .heading {
            padding: 5px;
            font-size: 23px;
            font-weight: bold;
        }

        li {
            color: #244c7e;
        }

        .age-details {
            display: flex;
            text-align: left;
            gap: 4px;
            width: 100px;
        }

        .passenger-details {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
        }

        .list-container {
            width: 70%;
            height: 50px;
            padding: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-left: 5px;
            margin-top: -15px;
        }

        .container-passengername {
            text-align: left;
            width: 100%;
            height: 40px;
        }

        .name-heading {
            font-size: 15px;
            color: rgb(135, 132, 132);
            margin-bottom: 11px;
        }

        .passenger-names {
            font-size: 20px;
            font-weight: 600;
            color: #244c7e;
            margin: 0;
        }

        .container-passengerage {
            text-align: left;
            width: 100%;
            height: 40px;
        }

        .age-heading {
            font-size: 15px;
            color: rgb(135, 132, 132);
        }

        .passenger-age {
            font-size: 20px;
            font-weight: 600;
            color: #244c7e;
            margin-top: -3px;
        }

        .container-passengergender {
            text-align: left;
            width: 100%;
            height: 40px;
        }

        .gender-heading {
            font-size: 15px;
            color: rgb(135, 132, 132);
        }

        .passenger-gender {
            font-size: 20px;
            font-weight: 600;
            color: #244c7e;
            margin-top: -3px;
        }

        .mail-heading {
            font-size: 20px;
            color: rgb(135, 132, 132);
        }

        .mail-id {
            font-size: 20px;
            font-weight: 600;
            color: #244c7e;
            margin-top: 20px;
        }

        .phoneno-heading {
            font-size: 20px;
            color: rgb(135, 132, 132);
        }

        .phone-number {
            font-size: 20px;
            font-weight: 600;
            color: #244c7e;
            margin-top: 20px;
        }

        .passenger-contact {
            margin-left: 20px;
        }

        .passenger-data {
            margin-top: -14px;
            margin-left: 20px;
        }

        @media (max-width: 992px) {
            body {
                margin: 10px;
                display: flex;
                justify-content: center;
            }
 p {
            line-height: 1;
        }
            .outer-border {
                width: 50%;
                height: auto;
            }

            .bus-booking-id {
                width: auto;
                height: 20px;
            }

            .booking-id {
                font-size: 8px;
            }

            .logo {
                height: 50px;
                width: 50px;
                margin-left: 0px;
            }

            .travels-name {
                width: 40%;
                align-items: center;
            }

            p {
                font-size: 8px;
            }

            .person {
                font-size: 8px;
            }

            .dashed-line {
                width: 1px;
                height: 60px;
            }

            .date {
                font-size: 8px;
            }

            .circle {
                width: 7px;
                height: 7px;
            }

            .inner-circle {
                width: 5px;
                height: 5px;
            }

            .dashed-line-hr {
                border-top: 1px dashed #000;
                width: 50px;
            }

            .bus {
                width: 45px;
                height: 16px;
                border-top-left-radius: 5px;
                border-top-right-radius: 5px;
                border-bottom-left-radius: 1px;
                border-bottom-right-radius: 1px;
                font-size: 8px;
            }

            .circle-one {
                width: 10px;
                height: 10px;
                bottom: -8px;
                left: 4px;
            }

            .inner-circle-one {
                width: 6px;
                height: 6px;
            }

            .circle-two {
                width: 10px;
                height: 10px;
                bottom: -8px;
                right: 3px;
            }

            .inner-circle-two {
                width: 6px;
                height: 6px;
            }

            .arrow {
                font-size: 8px;
            }

            .date {
                font-size: 8px;
            }

            .time {
                font-size: 10px
            }

            .price-tag {
                font-size: 8px;
            }

            .price {
                width: 40px;
                height: 10px;
                padding: 6px;
            }

            .ticket-details {
                padding: 10px;
                height: 180PX;
                align-items: center;
            }

            .bus-data {
                height: 170px;
                padding-left: 3px;
            }

            .dashed-line-separater-hr {
                border-top: 1px dashed #244c7e;
            }

            .left-cricle {
                width: 35px;
                height: 30px;
                border: 1px dashed #244c7e;
            }

            .right-cricle {
                width: 35px;
                height: 30px;
                border: 1px dashed #244c7e;
            }

            .contact {
                font-size: 14px;
                color: #244c7e;
                font-weight: 600;
                padding-left: 5px;
            }

            .mail {
                width: 50%;
                margin-left: 20px;
                color: #244c7e;
                text-align: left;
                gap: 0px;
            }

            .number {
                width: 50%;
                padding-left: 5px;
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 0px;
            }

            .country-code {
                width: 20%;
            }

            .passenger-contact-detalis {
                width: 100%;
                height: 60px;
                padding-left: 5px;
                padding-right: 5px;
                padding-left: 10px;
                padding-right: 10px;
                margin-top: -15px;
                gap: 0px;
            }

            .passenger-name {
                height: 40px;
                padding-left: 5px;
                padding-right: 5px;

            }

            .name {
                width: 40%;
                padding-left: 5px;
                border: 1px solid #244c7e;
                border-radius: 5px;
                border-right: 3px solid #244c7e;
            }

            .age {
                width: 10%;
                padding-left: 2px;
                border: 1px solid #244c7e;
                text-align: center;
                border-radius: 5px;
                border-right: 3px solid #244c7e;

            }

            .gender {
                width: 20%;
                border: 1px solid #244c7e;
                border-radius: 5px;
                justify-content: center;
                overflow: hidden;
            }

            .male {
                width: 50%;
                padding-left: 1px;
                border-right: 1px solid #244c7e;
                text-align: center;

            }

            .female {
                width: 50%;
                padding-left: 1px;
                text-align: center;
            }

            .barcode-container {
                padding: 5px;
            }

            .barcode-number {
                font-size: 12px;
                margin-top: -25px;
                margin-bottom: 5px;
            }

            .barcode {
                font-size: 60px;
                letter-spacing: -15px;
            }

            .mail-heading {
                font-size: 9px;
            }

            .mail-id {
                font-size: 12px;
                margin-top: 10px;
            }

            .phoneno-heading {
                font-size: 9px;
            }

            .phone-number {
                font-size: 12px;
                margin-top: 10px;
            }

            .heading {
                padding: 5px;
                font-size: 14px;
            }

            .passenger-data {
                margin-top: -10px;
                margin-left: 0px;
            }

            .list-container {
                width: 80%;
                height: 40px;
                padding: 10px;
                margin-top: -19px;
            }

            .container-passengername {
                text-align: left;
                width: 100%;
                height: 40px;
            }

            .name-heading {
                font-size: 9px;
            }

            .passenger-names {
                font-size: 12px;
            }

            .container-passengerage {
                text-align: left;
                width: 100%;
                height: 40px;
            }

            .age-heading {
                font-size: 9px;
            }

            .passenger-age {
                font-size: 12px;
                margin-top: 10px;
            }

            .container-passengergender {
                text-align: left;
                width: 100%;
                height: 40px;
            }

            .gender-heading {
                font-size: 9px;
            }

            .passenger-gender {
                font-size: 12px;
                margin-top: 10px;
            }

            li {
                font-size: 9px;
            }

            .passenger-contact {
                margin-left: 0px;
            }
        }

    </style>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css"
        integrity="sha512-Evv84Mr4kqVGRNSgIGL/F/aIDqQb7xQ2vcrdIwxfjThSH8CSR7PBEakCr51Ck+w+/U6swU2Im1vVX0SVk9ABhg=="
        crossorigin="anonymous" referrerpolicy="no-referrer" />
</head>

<body>
    <div class="outer-border">
        <div class="bus-booking-id">
            <p class="booking-id">Booking Id :${Booking_Id}</p>
            <p class="booking-id">Bus Partner Id : CHEN710438908207</p>
        </div>
        <div class="ticket-details">
            <div class="travels-name">
                <img src='${logo}' alt="logo." class="logo">
                <p style="font-weight: bold; margin-top: 35px; color: #244c7e;">${operator_name}</p>
                <p style="margin-top: -1px; color: #244c7e;">${Bus_Type}</p>
            </div>
            <div class="bus-design">
                <div class="bus-line">
                    <i class="fa-solid fa-bus person" style="color: #244c7e"></i>
                    <div class="dashed-line"></div>
                    <div class="circle">
                        <div class="inner-circle"></div>
                    </div>
                    <div class="dashed-line"></div>
                    <i class="fa-solid fa-bus person" style="color: #244c7e"></i>
                </div>
                <div class="bus-data">
                    <div class="bus-details-row-one">
                        <div class="bus-boarding">
                            <p style=" color: #244c7e" class="date">${departureDate}</p>
                            <p style="font-weight: bold; color: #244c7e" class="time">${departureTime}</p>
                            <p style="color: #244c7e">${departure_name}</p>
                        </div>
                        <div class="bus-graphics">
                            <div class="circle"></div>
                            <div class="dashed-line-hr"></div>
                            <div class="bus">${duration}
                                <div class="circle-one">
                                    <div class="inner-circle-one"></div>
                                </div>
                                <div class="circle-two">
                                    <div class="inner-circle-one"></div>
                                </div>
                            </div>
                            <div class="dashed-line-hr"></div>
                            <i class="fa-solid fa-chevron-right arrow" style=" color: #244c7e;"></i>
                        </div>
                        <div>
                            <div class="bus-dropping">
                                <p style=" color: #244c7e" class="date">${arrivalDate}</p>
                                <p style="font-weight: bold; color: #244c7e " class="time">${arrivalTime}</p>
                                <p style="color: #244c7e">${arrival_name}</p>
                            </div>
                        </div>
                    </div>
                    <div class="bus-details-row-two">
                        <div>
                            <p style="color: #244c7e">Boarding Point & Time</p>
                            <p style="font-weight: bold; color: #244c7e">${Pickup_Point_and_Time}</p>
                        </div>
                        <div>
                            <p style="text-align: right; color: #244c7e">Seat Numberds(s)</p>
                            <div style="width: auto; margin-top: -10px; height: 30px; display: flex; justify-content: center; align-items: center;"
                                id="seatno">
                               ${passenger.map(data => `
                                <p style="text-align: center; font-weight: bold; color: #244c7e">${data.seat}</p>
                                `
        )}
                            </div>

                        </div>
                    </div>
                    <div class="bus-details-row-three">
                        <div>
                            <p style="color: #244c7e">Dropping Point & Time</p>
                            <p style="font-weight: bold; color: #244c7e">${Dropping_Point_Time}</p>
                        </div>
                        <div class="price">
                            <p style="font-weight: bold;" class="price-tag">₹ ${rate}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="separater">
            <div class="left-cricle"></div>
            <div class="dashed-line-separater-hr"></div>
            <div class="right-cricle"></div>
        </div>
        <div class="passenger-contact">
            <p style=" color:#244c7e" class="contact">Contact Details</p>
            <div class="passenger-contact-detalis">
                <div class="mail">
                    <p class="mail-heading">Email:</p>
                    <p class="mail-id">${email_id}</p>
                </div>
                <div class="number">
                    <p class="phoneno-heading">Phone No:</p>
                    <p class="phone-number">${mobile_number}</p>

                </div>
            </div>
        </div>
        <div class="passenger-data" id="passengersdata">
            <p style="color:#244c7e" class="heading">Traveller Name</p>
            <ol class="passenger-details" id="passengerdetails">
             ${passenger.map((data) => `
              <div style="display: flex; justify-content: center; align-items: center;">
            <li>    
                </li>     
                <div class="list-container">
                 <div class="container-passengername">
                    <p class="name-heading">Name</p>
                   <p class="passenger-names">${data.user_name}</p>
                 </div>
                 <div class="container-passengerage">
                   <p class="age-heading ">Age</p>
                   <p class="passenger-age">${data.age}</p>
                 </div>
                 <div class="container-passengergender">
                   <p class="gender-heading ">Gender</p>
                   <p class="passenger-gender">${data.gender}</p>
                 </div>
               </div>
            </div>
              `
        ).join('')}
            </ol>
        </div>
        <div class="separater">
            <div class="left-cricle"></div>
            <div class="dashed-line-separater-hr"></div>
            <div class="right-cricle"></div>
        </div>
        <div class="barcode-container">
            <div class="barcode" style="display: flex; justify-content: center; align-items: center;">${Booking_Id}
            </div>
            <div class="barcode-number">${Booking_Id}</div>
        </div>

    </div>
</body>

</html>
    `;
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent);
        const pdfPath = path.resolve(__dirname, "..", "public", "Ticket_image", `${Booking_Id}.pdf`);
        await page.pdf({ path: pdfPath, printBackground: true });

        await browser.close();

        res.download(pdfPath, `${Booking_Id}_Ticket.pdf`, (err) => {
            if (err) {
                console.error("Error downloading file:", err);
                res.status(500).send("Error downloading PDF.");
            }
            fs.unlinkSync(pdfPath);
        });

    } catch (error) {
        console.error("Error generating image:", error);
        res.status(500).send("Error generating image.");
    }
}

module.exports = {
    putPrice
};


module.exports = { Getbooking, putBookingDetails, bookingDetails, putPrice, downloadticket }