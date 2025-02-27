const moment = require("moment");
const { tbsWebPool, tbsCrmPool } = require("../config/dbconfig");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");

exports.tbsBookingHistory = async (req, res) => {
    const {
        name,
        email,
        mobile,
        ticket_no,
        pnr_no,
        payment_status,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        login_user_id,
        login_user_email,
        login_user_mobile,
        source_id,
        source_name,
        pickup_point_id,
        pickup_point_name,
        depature_date,
        depature_time,
        destination_id,
        destination_name,
        droping_point_id,
        droping_point_name,
        arrival_date,
        arraival_time,
        operator_id,
        operator_name,
        passenger_details,
        total_fare,
        bustype,
        discount_amt, 
        offer_code, 
        base_fare
      } = req.body;
    
      const client = await tbsWebPool.connect();
      try {
        await client.query("BEGIN");
    
        const passengerJson = JSON.stringify(passenger_details);
    
        const bookingQuery = `
            INSERT INTO public."TBS_Booking_Transaction" 
            (name, email, mobile, ticket_no, pnr_no, payment_status, login_user_id, login_user_email, login_user_mobile, source_id, source_name, pickup_point_id, pickup_point_name, depature_date, depature_time, destination_id, destination_name, droping_point_id, droping_point_name, arrival_date, arraival_time, operator_id, operator_name, passenger_details,total_fare,discount_amt, offer_code, base_fare) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
            RETURNING ticket_no;
        `;
    
        const bookingResult = await client.query(bookingQuery, [
          name,
          email,
          mobile,
          ticket_no,
          pnr_no,
          payment_status,
          login_user_id,
          login_user_email,
          login_user_mobile,
          source_id,
          source_name,
          pickup_point_id,
          pickup_point_name,
          depature_date,
          depature_time,
          destination_id,
          destination_name,
          droping_point_id,
          droping_point_name,
          arrival_date,
          arraival_time,
          operator_id,
          operator_name,
          passengerJson,
          total_fare,
          discount_amt, 
          offer_code, 
          base_fare
        ]);

    if (!login_user_id) {
      try {
        let query;
        let values;

        if (email) {
          query = `
                SELECT 
                    tbs_passenger_id,
                    mobile_number,
                    email_id,
                    user_name 
                FROM public.passenger_profile 
                WHERE email_id = $1`;
          values = [email];
        } else if (mobile) {
          query = `
                SELECT 
                    tbs_passenger_id,
                    mobile_number,
                    email_id,
                    user_name 
                FROM public.passenger_profile 
                WHERE mobile_number = $1`;
          values = [mobile];
        } else {
          console.log(
            "No valid identifier provided (email or mobile_number required)."
          );
          return;
        }

        const result = await client.query(query, values);

        if (result.rows.length === 0) {
          console.log("No user found with the given email or mobile number.");
          return;
        }

        const value = result.rows[0];
        const identifierColumn = value.email_id ? "email" : "mobile";
        console.log(identifierColumn);
        const identifierValue =
          identifierColumn === "email" ? value.email_id : value.mobile_number;

        const updateQuery = `
            UPDATE public."TBS_Booking_Transaction"
            SET 
                login_user_id = $1,
                login_user_email = $2,
                login_user_mobile = $3,
                name = $4
            WHERE ${identifierColumn} = $5;
        `;

        const updateValues = [
          value.tbs_passenger_id,
          value.email_id,
          value.mobile_number,
          value.user_name,
          identifierValue,
        ];

        await client.query(updateQuery, updateValues);
        console.log(
          `Update successful for ${identifierColumn}:`,
          identifierValue
        );
      } catch (error) {
        console.error("Error updating login user:", error);
      }
    }

    const paymentQuery = `
        INSERT INTO public."TBS_Payment_Transaction" 
        (ticket_no, razorpay_order_id, razorpay_payment_id, razorpay_signature) 
        VALUES ($1, $2, $3, $4);
    `;

    await client.query(paymentQuery, [
      bookingResult.rows[0].ticket_no,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    ]);

    // await sendBookingConfirmationEmail(
    //   email,
    //   ticket_no,
    //   pnr_no,
    //   source_name,
    //   pickup_point_name,
    //   depature_date,
    //   depature_time,
    //   destination_name,
    //   droping_point_name,
    //   arrival_date,
    //   arraival_time,
    //   operator_name,
    //   passenger_details,
    //   total_fare,
    //   bustype,
    //   base_fare
    // );

    await client.query("COMMIT");

    res.status(200).json({ message: "Transaction successfully recorded" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Transaction failed:", error);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
  }
};

exports.getJouneryDetails = async (req, res) => {
  const { login_user_id } = req.body;
  const { no } = req.params;

  const currentDate = moment();

  if (!login_user_id) {
    return res
      .status(400)
      .json({ message: "Missing login_user_id in body parameters" });
  }

  try {
    const result = await tbsWebPool.query(
      'SELECT * FROM  public."TBS_Booking_Transaction" WHERE "login_user_id" = $1',
      [login_user_id]
    );

    if (!result.rows.length) {
      return res
        .status(200)
        .json({ message: "No bookings found", data: result.rows });
    }

    const journeys = {
      Upcoming: [],
      Completed: [],
    };

    result.rows.forEach((booking) => {
      booking.depature_time = moment(booking.depature_time, "HH:mm").format(
        "hh:mm A"
      );
      booking.arraival_time = moment(booking.arraival_time, "HH:mm").format(
        "hh:mm A"
      );

      const departureDate = new Date(booking.depature_date);
      const arrivalDate = new Date(booking.arrival_date);

      booking.depature_date = departureDate.toLocaleDateString("en-CA");
      booking.arrival_date = arrivalDate.toLocaleDateString("en-CA");

      const arrivalDateTime = moment(
        `${booking.arrival_date} ${booking.arraival_time}`,
        "YYYY-MM-DD hh:mm A"
      );
      booking.status = arrivalDateTime.isSameOrAfter(currentDate)
        ? "Upcoming"
        : "Completed";
      journeys[booking.status].push(booking);
    });

    if (no === "1") {
      return res
        .status(200)
        .json({ message: "Upcoming journeys", data: journeys.Upcoming });
    } else if (no === "2") {
      return res
        .status(200)
        .json({ message: "Completed journeys", data: journeys.Completed });
    }

    return res.status(400).json({ message: "Invalid journey number" });
  } catch (error) {
    console.error("Error fetching journeys:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

exports.ticketcancellation = async (req, res) => {
  const {
    login_user_id,
    login_user_email,
    login_user_mobile,
    ticket_no,
    pnr_no,
    source_name,
    pickup_point_name,
    depature_date,
    depature_time,
    destination_name,
    droping_point_name,
    arrival_date,
    arraival_time,
    operator_name,
    passenger_details,
    partialcancellation,
    new_ticket_no,
  } = req.body;

  const client = await tbsWebPool.connect();

  try {
    await client.query("BEGIN");

    const passengerJson = Array.isArray(passenger_details)
      ? passenger_details
      : JSON.parse(passenger_details);

    const passengerdetail = JSON.stringify(passenger_details);

    const bookingQuery = `
      INSERT INTO public."TBS_Booking_Cancellation_History" 
      (
        login_user_id, login_user_email, login_user_mobile,
        ticket_no, pnr_no, source_name, 
         pickup_point_name, depature_date, depature_time, 
         destination_name,  droping_point_name, 
        arrival_date, arraival_time,  operator_name, 
        passenger_details, partialcancellation, new_ticket_no
      ) 
      VALUES 
      ($1, $2, $3, $4, $5, $6, $7, 
       $8, $9, $10, $11, $12, $13, $14, 
       $15, $16, $17)
    `;

    await client.query(bookingQuery, [
      login_user_id,
      login_user_email,
      login_user_mobile,
      ticket_no,
      pnr_no,
      source_name,
      pickup_point_name,
      depature_date,
      depature_time,
      destination_name,
      droping_point_name,
      arrival_date,
      arraival_time,
      operator_name,
      passengerdetail,
      partialcancellation,
      new_ticket_no,
    ]);

    const data = await client.query(
      `SELECT * FROM public."TBS_Booking_Transaction" WHERE "ticket_no" = $1`,
      [ticket_no]
    );
    const value = data.rows[0].passenger_details;
    const dbPassengerList =
      typeof value === "string" ? JSON.parse(value) : value;
    const cancelledPassengerIds = new Set(passengerJson.map((p) => p.seat));
    const updatedPassengerList = dbPassengerList.filter(
      (passenger) => !cancelledPassengerIds.has(passenger.Seat_Num)
    );
    const passengers = JSON.stringify(updatedPassengerList);

    console.log(partialcancellation);
    if (partialcancellation === false && new_ticket_no === null) {
      const deleteQuery = `DELETE FROM public."TBS_Booking_Transaction" WHERE ticket_no = $1;`;
      await client.query(deleteQuery, [ticket_no]);

      return res.json({ message: "Booking deleted successfully" });
    }

    const updateQuery = `
      UPDATE public."TBS_Booking_Transaction"
      SET passenger_details = $1,
      ticket_no = $2
      WHERE ticket_no = $3
       RETURNING *;
  `;

    const updateddata = [passengers, new_ticket_no, ticket_no];

    await client.query(updateQuery, updateddata);

    await client.query("COMMIT");

    res.status(200).json({ message: "Cancellation successfully recorded" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Transaction failed:", error);
    res.status(500).json({ message: "Internal server error" });
  } finally {
    client.release();
  }
};

exports.getcancelledticketbyid = async (req, res) => {
  const { login_user_id } = req.body;

  if (!login_user_id) {
    return res.status(400).json({ message: "User ID is required" });
  }

  const client = await tbsWebPool.connect();

  try {
    const result = await client.query(
      `SELECT * FROM public."TBS_Booking_Cancellation_History" WHERE "login_user_id" = $1`,
      [login_user_id]
    );

    res.status(200).json({
      message: "Ticket Cancellation details",
      data: result.rows,
    });
  } catch (error) {
    console.error("Database query failed:", error);
    res.status(500).json({ message: "Internal Server Error" });
  } finally {
    client.release();
  }
};

exports.downloadticketbyid = async (req, res) => {
  const id = req.params.id;
  console.log(id);
  try {
    const { rows } = await tbsWebPool.query(
      'SELECT * FROM public."TBS_Booking_Transaction" WHERE "ticket_no" = $1',
      [id]
    );

    if (rows.length === 0) {
      return res.json({ message: "No booking found", success: false });
    }

    const {
        ticket_no,
        pnr_no,
        arrival_date,
        depature_date,
        arraival_time,
        depature_time,
        source_name,
        destination_name,
        pickup_point_name,
        operator_name,
        droping_point_name,
        passenger_details,
        total_fare,
        base_fare
      } = rows[0];
      
      const options = { day: "2-digit", month: "short", year: "numeric" };
      const departureDate = new Date(depature_date)
        .toLocaleDateString("en-GB", { ...options, timeZone: "UTC" })   
      const arrivalDate = new Date(arrival_date)
        .toLocaleDateString("en-GB", { ...options, timeZone: "UTC" })
      const departureTime = depature_time.split(":").slice(0, 2).join(".");
      const arrivalTime = arraival_time.split(":").slice(0, 2).join(".");
      const abbreviation1 = getCityAbbreviation(source_name);
      const abbreviation2 = getCityAbbreviation(destination_name);
      let start = moment(depature_time, "HH:mm");
      let end = moment(arraival_time, "HH:mm");
      if (end.isBefore(start)) {
          end.add(1, "day"); 
      }
      const duration = moment.duration(end.diff(start));
      const hours = Math.floor(duration.asHours());
      const minutes = duration.minutes();
      const durations = `${hours}:${minutes} Hrs`;
      const bookingDateTime = moment().format("DD MMMM YYYY, HH:mm");
  
      const passengerJson = passenger_details;
  
    if (!Array.isArray(passengerJson) || passengerJson.length === 0) {
      console.log("No passengers found");
      return '<div style="text-align: left;">No passengers found</div>';
    }
  
    const passengerDetails = passengerJson
      .map(
        (passenger) => `
                                  <div class="travellers-details">
                                      <div style="padding-left: 10px; width: 100%; text-align: left; line-height: 1px;">
                                          <p style="font-weight: 600; font-size: 14px; color: #393939;">${passenger.Passenger_Name}</p>
  
                                      </div>
                                      <div
                                          style="padding-right: 20px; line-height: 0.2;width: 30%; text-align: center; line-height: 1px;">
                                          <p style="font-weight: 600; font-size: 14px; color: #393939;">${passenger.GENDER_TYPE}</p>
  
                                      </div>
                                      <div
                                          style="padding-right: 20px; width: 10%; text-align: center; line-height: 1px; ">
                                          <p style="font-weight: 600; font-size: 14px; color: #393939;">${passenger.Age}</p>
  
                                      </div>
                                      <div style="padding-right: 20px; width: 30%; text-align: center; line-height: 1px;">
                                          <p style="font-weight: 600; font-size: 14px; color: #393939;">${passenger.Seat_Num}</p>
                                      </div>
                                  </div>
    `
      )
      .join("");
  
      const html = `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Document</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link
          href="https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@0,200;0,300;0,400;0,600;0,700;0,900;1,200;1,300;1,400;1,600;1,700&display=swap"
          rel="stylesheet">
      <style>
          body {
              font-family: Titillium Web;
              padding: 0;
              margin: 0;
              font-family: Arial, sans-serif;
              background-color: #f5f5f5;
          }
  
          .outer-border {
              width: 50%;
              height: auto;
              border-radius: 3px;
              margin: 0 auto;
              margin-top: 10px;
              background-color: #E8E8E8;
              padding-bottom: 10px;
          }
  
          .festivel-banner {
              width: 100%;
              height: 150px;
          }
  
          .poster {
              width: 100%;
              height: 150px;
          }
  
          .booking-details {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 10px;
              width: auto;
              height: auto;
              text-align: right;
              border-bottom: 5px solid #ffffff;
          }
  
          .logo {
              width: 212px;
              height: 45px;
          }
  
          .ticket-booking-details {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 0 10px;
              width: auto;
              height: auto;
              border-bottom: 5px solid #ffffff;
          }
  
          .source-to-destination p {
              line-height: 8px;
          }
  
          .source {
              font-weight: 600;
              font-size: 16px;
              letter-spacing: 0.1em;
              text-align: center;
          }
  
          .ticket-no p {
              font-size: 14px;
              line-height: 8px;
              font-weight: 600;
          }
  
          .ticket-no {
              text-align: left;
          }
  
          .ticket-no span {
              font-weight: 500;
              color: #393939;
              font-size: 12px;
          }
  
          .travels-details {
              padding: 0 10px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 5px solid #ffffff;
          }
  
          .travels-operator {
              text-align: left;
          }
  
          .travelsname {
              font-size: 20px;
              line-height: 8px;
              font-weight: 700;
          }
  
          .bustype {
              font-size: 12px;
              line-height: 8px;
              font-weight: 500;
              color: #717171;
          }
  
          .busstart {
              font-weight: 500;
              font-size: 14px;
              text-align: center;
              color: #717171;
          }
  
          .inner-border {
              width: 98%;
              height: auto;
              border: 5px solid #ffffff;
              border-radius: 3px;
              background-image: url('http://192.168.90.47:4001/public/pdf_image/bg.png');
              background-repeat: no-repeat;
              background-size: contain;
              background-position: center;
              background-color: #E8E8E8;
              background-blend-mode: overlay;
              margin: 0 auto;
              margin-top: 10px;
          }
  
          .available {
              margin-right: 10px;
          }
  
          .available_image {
              width: 168px;
              height: 29px;
          }
  
          .service-no {
              font-weight: 500;
              font-size: 12px;
              line-height: 8px;
              text-align: right;
              letter-spacing: 0.1em;
              color: #717171;
          }
  
          .bus-start {
              font-weight: 600;
              font-size: 14px;
              line-height: 8px;
              text-align: right;
              letter-spacing: 0.1em;
          }
  
          .boarding-dropping {
              width: 100%;
              height: 155px;
              border-bottom: 5px solid #ffffff;
              display: flex;
              justify-content: space-between;
          }
  
          .boarding-point {
              width: 100%;
              height: 155px;
              border-right: 5px solid #ffffff;
          }
  
          .duration {
              width: 100%;
              height: 155px;
              border-right: 5px solid #ffffff;
          }
  
          .dropping-point {
              width: 100%;
              height: 155px;
          }
  
          .sub-heading {
              width: 100%;
              height: auto;
              background-color: #c5c5c5c5;
              text-align: left;
          }
  
          .sub-heading p {
              padding: 5px 12px;
              font-weight: 600;
              font-size: 18px;
              line-height: 16.94px;
              letter-spacing: 0%;
  
          }
  
          .boarding-date {
              padding: 2px 12px;
              font-weight: 600;
              font-size: 18px;
              line-height: 1px;
              letter-spacing: 0%;
  
          }
  
          .boarding-place {
              padding: 2px 12px;
              font-weight: 500;
              font-size: 16px;
              line-height: 20px;
              letter-spacing: 1px;
              color: #393939;
          }
  
          .dropping-heading {
              width: 100%;
              height: auto;
              background-color: #c5c5c5c5;
              text-align: right;
          }
  
          .dropping-heading p {
              padding: 5px 12px;
              font-weight: 600;
              font-size: 18px;
              line-height: 16.94px;
              letter-spacing: 1px;
          }
  
          .dropping-date {
              padding: 2px 12px;
              font-weight: 600;
              font-size: 18px;
              line-height: 1px;
              letter-spacing: 1px;
              text-align: right;
          }
  
          .dropping-place {
              padding: 2px 12px;
              font-weight: 500;
              font-size: 16px;
              line-height: 20px;
              letter-spacing: 1px;
              text-align: right;
              color: #393939;
          }
  
          .travel-area {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 0 5px;
              width: 70%;
              margin: -20px auto
          }
  
          .from,
          .to {
              font-weight: 800;
              font-size: 35px;
              letter-spacing: 5%;
          }
  
          .circle {
              width: 10px;
              height: 10px;
              background-color: #393939;
              border-radius: 50%;
              margin-top: -5px;
          }
  
          .line {
              width: 40px;
              height: 2px;
              border-top: 2px dashed #393939;
              margin-top: -5px;
          }
  
          .bus {
              display: flex;
              justify-content: center;
              align-items: center;
              margin: -10px auto
          }
  
          .arrow {
              width: 0;
              height: 0;
              border-left: 15px solid #393939;
              border-top: 8px solid transparent;
              border-bottom: 8px solid transparent;
              margin-top: -6px;
          }
  
          .other-details {
              width: 100%;
              height: auto;
              display: flex;
              justify-content: center;
              align-items: center;
          }
  
          .left-side {
              width: 100%;
              height: 100%;
              border-right: 5px solid #ffffff;
          }
  
          .right-side {
              width: 100%;
              height: 540px;
          }
  
          .passenger-details {
              width: 100%;
              height: 235px;
              border-bottom: 5px solid #ffffff;
          }
  
          .passenger-label {
              width: 100%;
              height: auto;
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-top: -10px;
          }
  
          .travellers-details {
              width: 100%;
              height: auto;
              display: flex;
              justify-content: space-between;
              align-items: center;
          }
  
          .cancellation {
              width: 100%;
              height: auto;
              border-bottom: 5px solid #ffffff;
              padding-bottom: 5px;
          }
  
          .cancellation-label {
              width: 100%;
              height: auto;
              display: flex;
              justify-content: space-between;
              align-items: center;
          }
  
          .cancellation-details {
              width: 100%;
              height: auto;
              display: flex;
              justify-content: space-between;
              align-items: center;
          }
  
          .contact-us {
              width: 100%;
              height: auto;
          }
  
          .connect {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 0 30px;
          }
  
          .connect p {
              font-weight: 600;
              font-size: 16px;
              line-height: 12.1px;
              letter-spacing: 0%;
              color: #717171;
          }
  
          .connect img {
              width: 20px;
              height: 20px;
              color: #717171;
          }
  
          .Copyright {
              text-align: center;
              padding: 0 20px;
          }
  
          .Copyright p {
              font-weight: 600;
              font-size: 11px;
              line-height: 9.68px;
              letter-spacing: 0%;
              color: #717171;
          }
  
          .ticket-fare {
              width: 100%;
              height: auto;
              border-bottom: 5px solid #ffffff;
          }
  
          .fare {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 0 20px;
          }
  
          .name {
              font-weight: 600;
              font-size: 16px;
              line-height: 1px;
              letter-spacing: 0%;
              color: #838383;
          }
  
          .fare-details {
              font-weight: 600;
              font-size: 16px;
              line-height: 1px;
              letter-spacing: 0%;
              color: #393939;
          }
  
          .amount-paid {
              font-weight: 600;
              font-size: 14px;
              line-height: 1px;
              letter-spacing: 0%;
              color: #393939;
          }
  
          .amount {
              font-weight: 800;
              font-size: 16px;
              line-height: 1px;
              letter-spacing: 0%;
              color: #1F487C;
          }
  
          .Policy {
              width: 100%;
              height: 375px;
          }
  
          .Conditions {
              padding: 0 7px;
              margin-top: -10px;
          }
  
          .Conditions li {
              font-weight: 500;
              font-size: 14px;
              line-height: 20px;
              letter-spacing: 0%;
              text-align: left;
              color: #717171;
              margin-left: -15px;
              text-align: justify;
          }
  
          .Conditions strong {
              color: #393939;
          }
  
          @media (max-width: 998px) {
              .outer-border {
                  width: 98%;
                  height: auto;
              }
  
              .Conditions li {
                  line-height: 19px;
                  font-size: 12px;
              }
  
              .Copyright p {
                  font-size: 9px;
              }
  
              .Copyright {
              padding: 0 10px;
          }
  
              .travel-area {
                  margin: -10px auto
              }
  
              .from,
              .to {
                  font-size: 30px;
              }
          }
      </style>
  </head>
  
  <body>
      <div class="outer-border">
          <div class="festivel-banner">
              <img src="http://192.168.90.47:4001/public/pdf_image/Christmas.png" alt="" class="poster">
          </div>
          <div class="inner-border">
              <div class="booking-details">
                  <img src="http://192.168.90.47:4001/public/pdf_image/tbs.png" alt="" class="logo">
                  <div>
                      <div class="available">
                          <img src="http://192.168.90.47:4001/public/pdf_image/available.png" alt="" class="available_image">
                      </div>
                  </div>
              </div>
              <div class="ticket-booking-details">
                  <div class="ticket-no">
                      <p><span>TBSBus Booking ID:</span> ${ticket_no}</p>
                      <p><span>Bus Partner PNR:</span> ${pnr_no}</p>
                  </div>
                  <div class="source-to-destination">
                      <p class="source">thebusstand.com Ticket</p>
                      <p class="busstart">Booked on ${bookingDateTime}</p>
                  </div>
              </div>
              <div class="travels-details">
                  <div class="travels-operator">
                      <p class="travelsname">${operator_name}</p>
                      <p class="bustype">2 + 1 (32) GRAND SLEEPER,AC, LED NEW- AC</p>
                  </div>
                  <div class="ticket-time">
                      <p class="service-no">Service No. SVR 0909 - SPL</p>
                      <p class="bus-start">Bus Start Time:${departureTime}</p>
                  </div>
              </div>
              <div class="boarding-dropping">
                  <div class="boarding-point">
                      <div class="sub-heading">
                          <p>Bording Point & Time</p>
                      </div>
                      <p class="boarding-date">${departureDate} - ${departureTime}</p>
                      <p class="boarding-place">${pickup_point_name}</p>
                  </div>
                  <div class="duration">
                      <div class="travel-area">
                          <p class="from">${abbreviation1}</p>
                          <p class="to">${abbreviation2}</p>
                      </div>
                      <div class="bus">
                          <div class="circle"></div>
                          <div class="line"></div>
                          <svg width="75" height="40" viewBox="0 0 75 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path
                                  d="M7.20526 0.350586C3.6963 0.350586 0.882812 3.22788 0.882812 6.81641V26.6416C0.882812 28.1909 2.13873 29.4468 3.68797 29.4468H8.57673C8.57673 32.019 9.5759 34.486 11.3544 36.3048C13.133 38.1237 15.5452 39.1455 18.0604 39.1455C20.5756 39.1455 22.9878 38.1237 24.7664 36.3048C26.5449 34.486 27.5441 32.019 27.5441 29.4468H49.2543C49.2543 32.019 50.2535 34.486 52.0321 36.3048C53.8106 38.1237 56.2228 39.1455 58.738 39.1455C61.2532 39.1455 63.6654 38.1237 65.444 36.3048C67.2225 34.486 68.2217 32.019 68.2217 29.4468H71.739C73.2882 29.4468 74.5441 28.1909 74.5441 26.6416V6.81641C74.5441 3.22788 71.7306 0.350586 68.2217 0.350586H7.20526ZM18.0604 24.5974C19.318 24.5974 20.5241 25.1083 21.4134 26.0178C22.3026 26.9272 22.8022 28.1607 22.8022 29.4468C22.8022 30.7329 22.3026 31.9664 21.4134 32.8758C20.5241 33.7852 19.318 34.2962 18.0604 34.2962C16.8028 34.2962 15.5967 33.7852 14.7074 32.8758C13.8182 31.9664 13.3186 30.7329 13.3186 29.4468C13.3186 28.1607 13.8182 26.9272 14.7074 26.0178C15.5967 25.1083 16.8028 24.5974 18.0604 24.5974ZM58.738 24.5974C59.9956 24.5974 61.2017 25.1083 62.091 26.0178C62.9803 26.9272 63.4798 28.1607 63.4798 29.4468C63.4798 30.7329 62.9803 31.9664 62.091 32.8758C61.2017 33.7852 59.9956 34.2962 58.738 34.2962C57.4804 34.2962 56.2743 33.7852 55.385 32.8758C54.4958 31.9664 53.9962 30.7329 53.9962 29.4468C53.9962 28.1607 54.4958 26.9272 55.385 26.0178C56.2743 25.1083 57.4804 24.5974 58.738 24.5974Z"
                                  fill="#393939" />
                              <text x="50%" y="40%" font-size="14" fill="white" font-weight="600" text-anchor="middle"
                                  dominant-baseline="middle">${durations}</text>
                          </svg>
  
                          <div class="line"></div>
                          <div class="arrow"></div>
                      </div>
                  </div>
                  <div class="dropping-point">
                      <div class="dropping-heading">
                          <p>Dropping Point & Time</p>
                      </div>
                      <p class="dropping-date">${arrivalDate} - ${arrivalTime}</p>
                      <p class="dropping-place">${droping_point_name}</p>
                  </div>
              </div>
              <div class="other-details">
                  <div class="left-side">
                      <div class="passenger-details">
                          <div class="boarding-point">
                              <div class="sub-heading">
                                  <p>Passenger Details</p>
                              </div>
                              <div class="passenger-label">
                                  <div style="padding-left: 10px; width: 100%; text-align: left; line-height: 1px;">
                                      <p style="font-weight: 600; font-size: 14px; color: #717171;">Traveller Name</p>
  
                                  </div>
                                  <div
                                      style="padding-right: 20px; line-height: 0.2;width: 30%; text-align: center; line-height: 1px;">
                                      <p style="font-weight: 600; font-size: 14px; color: #717171;">Gender</p>
  
                                  </div>
                                  <div style="padding-right: 20px; width: 10%; text-align: center; line-height: 1px; ">
                                      <p style="font-weight: 600; font-size: 14px; color: #717171;">Age</p>
  
                                  </div>
                                  <div style="padding-right: 20px; width: 30%; text-align: center; line-height: 1px;">
                                      <p style="font-weight: 600; font-size: 14px; color: #717171;">Seat No</p>
                                  </div>
                              </div>
                             <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; margin-top: -18px;">
                              ${passengerDetails}
                              </div>
                          </div>
                      </div>
                      <div class="cancellation">
                          <div class="sub-heading">
                              <p>Cancellation Policy</p>
                          </div>
                          <div class="cancellation-label">
                              <div style="padding-left: 10px; width: 100%; text-align: left; line-height: 1px;">
                                  <p style="font-weight: 600; font-size: 14px; color: #717171;">Cancellation Time</p>
  
                              </div>
                              <div
                                  style="padding-right: 20px; line-height: 0.2;width: 50%; text-align: center; line-height: 1px;">
                                  <p style="font-weight: 600; font-size: 14px; color: #717171;">Refund(%)</p>
  
                              </div>
                              <div style="padding-right: 20px; width: 70%; text-align: center; line-height: 1px; ">
                                  <p style="font-weight: 600; font-size: 14px; color: #717171;">Refund Amount</p>
  
                              </div>
                          </div>
                          <div class="cancellation-details">
                              <div style="padding-left: 10px; width: 100%; text-align: left; line-height: 1px;">
                                  <p style="font-weight: 400; font-size: 12px; color: #717171;">Before 29-May 18:30</p>
                              </div>
                              <div
                                  style="padding-right: 20px; line-height: 0.2;width: 50%; text-align: center; line-height: 1px;">
                                  <p style="font-weight: 400; font-size: 12px; color: #393939;">85%</p>
                              </div>
                              <div style="padding-right: 20px; width: 70%; text-align: center; line-height: 1px; ">
                                  <p style="font-weight: 400; font-size: 12px; color: #393939;">Rs.1454</p>
                              </div>
                          </div>
                          <div class="cancellation-details">
                              <div style="padding-left: 10px; width: 100%; text-align: left; line-height: 18px;">
                                  <p style="font-weight: 400; font-size: 12px; color: #717171;">Between 29-May 18:30 &
                                      30-May 12:30</p>
                              </div>
                              <div
                                  style="padding-right: 20px; line-height: 0.2;width: 50%; text-align: center; line-height: 1px;">
                                  <p style="font-weight: 400; font-size: 12px; color: #393939;">70%</p>
                              </div>
                              <div style="padding-right: 20px; width: 70%; text-align: center; line-height: 1px; ">
                                  <p style="font-weight: 400; font-size: 12px; color: #393939;">Rs.1197</p>
                              </div>
                          </div>
                          <div class="cancellation-details">
                              <div style="padding-left: 10px; width: 100%; text-align: left; line-height: 1px;">
                                  <p style="font-weight: 400; font-size: 12px; color: #717171;">Before 29-May 18:30</p>
                              </div>
                              <div
                                  style="padding-right: 20px; line-height: 0.2;width: 50%; text-align: center; line-height: 1px;">
                                  <p style="font-weight: 400; font-size: 12px; color: #393939;">0%</p>
                              </div>
                              <div style="padding-right: 20px; width: 70%; text-align: center; line-height: 1px; ">
                                  <p style="font-weight: 400; font-size: 12px; color: #393939;">Rs.0</p>
                              </div>
                          </div>
                      </div>
                      <div class="contact-us">
                          <div class="connect">
                              <p>Connect with us</p>
                              <a href="https://thebusstand.com/"><img src="http://192.168.90.47:4001/public/pdf_image/Web.png" alt="web"></a>
                              <a href=""><img src="http://192.168.90.47:4001/public/pdf_image/fb.png" alt="fb"></a>
                              <a href=""><img src="http://192.168.90.47:4001/public/pdf_image/insta.png" alt="insta"></a>
                              <a href=""><img src="http://192.168.90.47:4001/public/pdf_image/x.png" alt="x"></a>
  
                          </div>
                          <div class="Copyright">
                              <p>Copyright thebusstand.com | Powered by Ra Travel Tech. | All Rights Reserved.</p>
                          </div>
                      </div>
                  </div>
                  <div class="right-side">
                      <div class="ticket-fare">
                          <div class="sub-heading">
                              <p>Payment Details</p>
                          </div>
                          <div class="fare">
                              <p class="name">Basic Fare</p>
                              <p class="fare-details">${base_fare}</p>
                          </div>
                          <div class="fare">
                              <p class="name">Bus Partner GST</p>
                              <p class="fare-details">86.00</p>
                          </div>
                          <div class="fare">
                              <p class="amount-paid">Amount Paid</p>
                              <p class="amount">₹${total_fare}</p>
                          </div>
                      </div>
                      <div class="Policy">
                          <div class="sub-heading">
                              <p>Terms & Conditions</p>
                          </div>
                          <div class="Conditions">
                              <ul>
                                  <li>The <strong>arrival and departure times </strong>mentioned on the ticket are
                                      <strong>tentative </strong>and subject to
                                      change.
                                  </li>
                                  <li>Passengers are requested to <strong>arrive at the boarding point at least 15
                                          minutes</strong> before the
                                      scheduled departure time.</li>
                                  <li><strong>theBusStand.com is not responsible </strong>for any accidents or loss of
                                      passenger belongings.
                                  </li>
                                  <li><strong>theBusStand.com is not liable</strong> for any delays or inconveniences
                                      during the journey due to
                                      vehicle breakdowns or other circumstances beyond our control.</li>
                                  <li>If a <strong>bus service is canceled</strong>, for tickets booked through
                                      <strong>theBusStand.com</strong>, the refund
                                      amount will be credited back to the passenger’s <strong>Credit/Debit Card or Bank
                                          Account</strong> used
                                      for booking.
                                  </li>
                                  <li><strong>Cancellation charges</strong> are applicable on the <strong>original
                                          fare</strong> but not on the <strong>discounted fare</strong>.
                                  </li>
                                  <li>Any <strong>complaints or grievances</strong> related to the journey should be
                                      reported within <strong>seven days</strong>
                                      from the date of travel.</li>
                              </ul>
                          </div>
                      </div>
  
                  </div>
              </div>
          </div>
      </div>
  </body>
  
  </html>`;
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html);
    const pdfPath = path.resolve(
      __dirname,
      "..",
      "public",
      "Ticket_image",
      `${ticket_no}.pdf`
    );
    await page.pdf({ path: pdfPath, printBackground: true });

    await browser.close();

    res.download(pdfPath, `${ticket_no}_Ticket.pdf`, (err) => {
      if (err) {
        console.error("Error downloading file:", err);
        res.status(500).send("Error downloading PDF.");
      }
      fs.unlinkSync(pdfPath);
    });

    // const browser = await puppeteer.launch({
    //   headless: "new",
    //   args: ["--no-sandbox", "--disable-setuid-sandbox"],
    // });
    // const page = await browser.newPage();
    // await page.setContent(html, { waitUntil: "load" });
    // const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    // console.log("PDF Generated Successfully!");
    // await browser.close();
    // console.log("PDF Buffer Size:", pdfBuffer.length);
    // res.setHeader("Content-Type", "application/pdf");
    // res.setHeader("Content-Length", pdfBuffer.length);
    // res.setHeader(
    //   "Content-Disposition",
    //   `attachment; filename="ticket_${ticket_no}.pdf"`
    // );
    // res.end(pdfBuffer);
  } catch (error) {
    console.error("Error generating image:", error);
    res.status(500).send("Error generating image.");
  }
};

const sendBookingConfirmationEmail = async (
    email,
    ticket_no,
    pnr_no,
    source_name,
    pickup_point_name,
    depature_date,
    depature_time,
    destination_name,
    droping_point_name,
    arrival_date,
    arraival_time,
    operator_name,
    passenger_details,
    total_fare,
    bustype,
    base_fare
  ) => {
    const passengerJson = passenger_details;
    if (!Array.isArray(passengerJson) || passengerJson.length === 0) {
      console.log("No passengers found");
      return '<div style="text-align: left;">No passengers found</div>';
    }
  
    const passengerDetails = passengerJson
      .map(
        (passenger) => `
    <div style="display: flex; justify-content: space-between; width: 100%;">
            <div style="padding-left: 10px; line-height: 1.2; width: 100%; text-align: left;">
                <p style="font-weight: 600; font-size: 16px;">${passenger.Passenger_Name}</p>
            </div>
            <div style="padding-right: 20px; line-height: 1.2; width: 100%; text-align: left;">
                <p style="font-weight: 600; font-size: 16px;">${passenger.Age} & ${passenger.GENDER_TYPE}</p>
            </div>
            <div style="padding-right: 20px; line-height: 1.2; width: 30%; text-align: left;">
                <p style="font-weight: 600; font-size: 16px;">${passenger.Seat_Num}</p>
            </div>
        </div>
    `
      )
      .join("");
  
      const passenger = passengerJson
      .map(
        (passenger) => `
            <div class="travellers-details">
                                      <div style="padding-left: 10px; width: 100%; text-align: left; line-height: 1px;">
                                          <p style="font-weight: 600; font-size: 14px; color: #393939;">${passenger.Passenger_Name}</p>
  
                                      </div>
                                      <div
                                          style="padding-right: 20px; line-height: 0.2;width: 30%; text-align: center; line-height: 1px;">
                                          <p style="font-weight: 600; font-size: 14px; color: #393939;">${passenger.GENDER_TYPE}</p>
  
                                      </div>
                                      <div
                                          style="padding-right: 20px; width: 10%; text-align: center; line-height: 1px; ">
                                          <p style="font-weight: 600; font-size: 14px; color: #393939;">${passenger.Age}</p>
  
                                      </div>
                                      <div style="padding-right: 20px; width: 30%; text-align: center; line-height: 1px;">
                                          <p style="font-weight: 600; font-size: 14px; color: #393939;">${passenger.Seat_Num}</p>
                                      </div>
                                  </div>
    `
      )
      .join("");
    
    const options = { day: "2-digit", month: "short" };
    const departure = new Date(depature_date).toLocaleDateString("en-GB", {
      ...options,
    });
    const arrival = new Date(arrival_date).toLocaleDateString("en-GB", {
      ...options,
    });
    const option = { day: "2-digit", month: "short", year: "numeric" };
    const departureDate = new Date(depature_date)
        .toLocaleDateString("en-GB", { ...option, timeZone: "UTC" })   
    const arrivalDate = new Date(arrival_date)
        .toLocaleDateString("en-GB", { ...option, timeZone: "UTC" })
    const departureTime = depature_time.split(":").slice(0, 2).join(".");
    const arrivalTime = arraival_time.split(":").slice(0, 2).join(".");
    const abbreviation1 = getCityAbbreviation(source_name);
    const abbreviation2 = getCityAbbreviation(destination_name);
    let start = moment(depature_time, "HH:mm");
    let end = moment(arraival_time, "HH:mm");
    if (end.isBefore(start)) {
        end.add(1, "day"); 
    }
    const duration = moment.duration(end.diff(start));
    const hours = Math.floor(duration.asHours());
    const minutes = duration.minutes();
    const durations = `${hours}:${minutes} Hrs`;
    const bookingDateTime = moment().format("DD MMMM YYYY, HH:mm");
  
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
            <p style="color: #585858; font-weight: 600; font-size: 30px; line-height: 19.52px;">Hi ${
              passengerJson.length > 0
                ? passengerJson[0].Passenger_Name
                : "Passenger"
            }</p>
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
                <br><span style="font-weight: 400; font-size: 24px; line-height: 31.32px">${ticket_no}</span>
            </p>
        </div>
  
        <div style="width: 100%; text-align: center;">
            <div style="max-width: 365px; height: auto; display: inline-block; ">
                <div
                    style="width: 361px; height: auto; background-color: #1F487C; border: 2px solid #1F487C; border-top-left-radius: 10px; border-top-right-radius: 10px; text-align: center;">
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px;">
                        <div style="padding: 5px ; width: 100%;">
                            <p style="font-size: 36px; font-weight: 900;line-height: 1.38px; color: #FFFFFF;">${abbreviation1}
                            </p>
                            <p style="font-size: 14.67px; font-weight: 600; line-height: 0.75px; color: #FFFFFF;">
                               ${departure}</p>
                        </div>
                        <div
                            style="width: 100%; display: flex; align-items: center; justify-content: center; margin-top: 20px; ">
                            <div class="dashed-line-hr"
                                style="border-top: 3px dashed #FFFFFF; width: 98%;margin-top: 22px;"></div>
                            <p style="margin-top: 5px;font-size:20px; color:#FFFFFF;  margin-top: 10px; ">></p>
                        </div>
                        <div style="padding: 5px;  width: 100%;">
                            <p style="font-size: 36px; font-weight: 900;line-height: 1.38px; color: #FFFFFF;">${abbreviation2}
                            </p>
                            <p style="font-size: 14.67px; font-weight: 600;color: #FFFFFF; line-height: 0.75px;">
                               ${arrival}
                            </p>
                        </div>
                    </div>
                    <p style="font-weight: 400; font-size: 18.86px; color: #FFFFFF;  line-height: 0.75px;">Ticket
                        Number
                        :${ticket_no}</p>
                    <p style="font-weight: 400; font-size: 18.86px; color: #FFFFFF;  line-height: 17.75px;">PNR :
                        ${pnr_no}</p>
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
                    <div style=" display: flex; align-items: center; width: 100%; justify-content: center;">
                        <div style=" height: auto; width: 100%; text-align: left; padding: 5px ;">
                            <p style="font-weight: 600;font-size: 16px;line-height:10.36px; ">
                                ${source_name}
                            </p>
                            <p style="color: #393939; font-weight: 400; font-size: 16px; line-height:10.36px;">
                                 ${departure}
                            </p>
                            <p style="font-weight: 700; color: #393939; font-size: 16px; line-height: 10.36px; ">
                                ${depature_time}
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
                           ${durations}
                          </div>
                         
  
  
                            <div class="dashed-line-hr"
                                style="border-top: 2px dashed #244c7e; width: 25px; margin-top: 22px;"></div>
                            <p style="margin-top: 11px; font-size:18px; color:#244c7e; ">></p>
                        </div>
                        <div style=" height: auto; width:100%; text-align: right; padding: 5px;">
                            <p style="font-weight: 600;font-size: 16px;line-height: 10.36px;">
                                ${destination_name}
                            </p>
                            <p style="color: #393939; font-weight: 400; font-size: 16px; line-height: 10.36px;">
                               ${arrival}
                            </p>
                            <p style="font-weight: 700; color: #393939; font-size: 16px; line-height: 10.36px;">
                                ${arraival_time}
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
                                    ${total_fare}
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
  `;
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
            <p style="color: #585858; font-weight: 600; font-size: 30px; line-height: 19.52px;">Hi ${
              passengerJson.length > 0
                ? passengerJson[0].Passenger_Name
                : "Passenger"
            }</p>
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
                <br><span style="font-weight: 400; font-size: 24px; line-height: 31.32px">${ticket_no}</span>
            </p>
        </div>
  
        <div style="width: 100%; text-align: center;">
            <div style="max-width: 365px; height: auto; display: inline-block; ">
                <div
                    style="width: 361px; height: auto; background: linear-gradient(135.34deg, #F6B642 15.43%, #FFF279 38.03%, #F6B642 57.93%, #FFDF71 69.97%, #FBE67B 86.26%);
                    border: 2px solid #D89E2F; border-top-left-radius: 10px; border-top-right-radius: 10px; text-align: center;">
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px;">
                        <div style="padding: 5px ; width: 100%;">
                            <p style="font-size: 36px; font-weight: 900;line-height: 1.38px; color: #141414;">${abbreviation1}
                            </p>
                            <p style="font-size: 14.67px; font-weight: 600; line-height: 0.75px; color: #141414">
                                ${departure}</p>
                        </div>
                        <div
                            style="width: 100%; display: flex; align-items: center; justify-content: center; margin-top: 20px; ">
                            <div class="dashed-line-hr"
                                style="border-top: 3px dashed #141414; width: 98%;margin-top: 22px;"></div>
                            <p style="margin-top: 8px;font-size:20px; color:#141414;  margin-top: 10px; ">></p>
                        </div>
                        <div style="padding: 5px;  width: 100%;">
                            <p style="font-size: 36px; font-weight: 900;line-height: 1.38px; color: #141414;">${abbreviation2}
                            </p>
                            <p style="font-size: 14.67px; font-weight: 600;color: #141414; line-height: 0.75px;">
                                ${arrival}
                            </p>
                        </div>
                    </div>
                    <p style="font-weight: 400; font-size: 18.86px; color: #141414;  line-height: 0.75px;">Ticket
                        Number
                        :${ticket_no}</p>
                    <p style="font-weight: 400; font-size: 18.86px; color: #141414;  line-height: 17.75px;">PNR :
                        ${pnr_no}</p>
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
                    <div style=" display: flex; align-items: center; width: 100%; justify-content: center;">
                        <div style=" height: auto; width: 100%; text-align: left; padding: 5px ;">
                            <p style="font-weight: 600;font-size: 16px;line-height:10.36px; ">
                                ${source_name}
                            </p>
                            <p style="color: #393939; font-weight: 400; font-size: 16px; line-height:10.36px;">
                                ${departure}
                            </p>
                            <p style="font-weight: 700; color: #393939; font-size: 16px; line-height: 10.36px; ">
                                ${depature_time}
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
                            ${durations}
                          </div>
                         
  
  
                            <div class="dashed-line-hr"
                                style="border-top: 2px dashed #D89E2F; width: 25px;margin-top: 22px;"></div>
                            <p style="margin-top: 11px; font-size:18px; color:#D89E2F; ">></p>
                        </div>
                        <div style=" height: auto; width:100%; text-align: right; padding: 5px;">
                            <p style="font-weight: 600;font-size: 16px;line-height: 10.36px;">
                               ${destination_name}
                            <p style="color: #393939; font-weight: 400; font-size: 16px; line-height: 10.36px;">
                                ${arrival}
                            </p>
                            <p style="font-weight: 700; color: #393939; font-size: 16px; line-height: 10.36px;">
                                ${arraival_time}
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
                                   ${total_fare}
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
    `;
    const htmlContent = `
    <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Document</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link
          href="https://fonts.googleapis.com/css2?family=Titillium+Web:ital,wght@0,200;0,300;0,400;0,600;0,700;0,900;1,200;1,300;1,400;1,600;1,700&display=swap"
          rel="stylesheet">
      <style>
          body {
              font-family: Titillium Web;
              padding: 0;
              margin: 0;
              font-family: Arial, sans-serif;
              background-color: #f5f5f5;
          }
  
          .outer-border {
              width: 50%;
              height: auto;
              border-radius: 3px;
              margin: 0 auto;
              margin-top: 10px;
              background-color: #E8E8E8;
              padding-bottom: 10px;
          }
  
          .festivel-banner {
              width: 100%;
              height: 150px;
          }
  
          .poster {
              width: 100%;
              height: 150px;
          }
  
          .booking-details {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 10px;
              width: auto;
              height: auto;
              text-align: right;
              border-bottom: 5px solid #ffffff;
          }
  
          .logo {
              width: 212px;
              height: 45px;
          }
  
          .ticket-booking-details {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 0 10px;
              width: auto;
              height: auto;
              border-bottom: 5px solid #ffffff;
          }
  
          .source-to-destination p {
              line-height: 8px;
          }
  
          .source {
              font-weight: 600;
              font-size: 16px;
              letter-spacing: 0.1em;
              text-align: center;
          }
  
          .ticket-no p {
              font-size: 14px;
              line-height: 8px;
              font-weight: 600;
          }
  
          .ticket-no {
              text-align: left;
          }
  
          .ticket-no span {
              font-weight: 500;
              color: #393939;
              font-size: 12px;
          }
  
          .travels-details {
              padding: 0 10px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              border-bottom: 5px solid #ffffff;
          }
  
          .travels-operator {
              text-align: left;
          }
  
          .travelsname {
              font-size: 20px;
              line-height: 8px;
              font-weight: 700;
          }
  
          .bustype {
              font-size: 12px;
              line-height: 8px;
              font-weight: 500;
              color: #717171;
          }
  
          .busstart {
              font-weight: 500;
              font-size: 14px;
              text-align: center;
              color: #717171;
          }
  
          .inner-border {
              width: 98%;
              height: auto;
              border: 5px solid #ffffff;
              border-radius: 3px;
              background-image: url('http://192.168.90.47:4001/public/pdf_image/bg.png');
              background-repeat: no-repeat;
              background-size: contain;
              background-position: center;
              background-color: #E8E8E8;
              background-blend-mode: overlay;
              margin: 0 auto;
              margin-top: 10px;
          }
  
          .available {
              margin-right: 10px;
          }
  
          .available_image {
              width: 168px;
              height: 29px;
          }
  
          .service-no {
              font-weight: 500;
              font-size: 12px;
              line-height: 8px;
              text-align: right;
              letter-spacing: 0.1em;
              color: #717171;
          }
  
          .bus-start {
              font-weight: 600;
              font-size: 14px;
              line-height: 8px;
              text-align: right;
              letter-spacing: 0.1em;
          }
  
          .boarding-dropping {
              width: 100%;
              height: 155px;
              border-bottom: 5px solid #ffffff;
              display: flex;
              justify-content: space-between;
          }
  
          .boarding-point {
              width: 100%;
              height: 155px;
              border-right: 5px solid #ffffff;
          }
  
          .duration {
              width: 100%;
              height: 155px;
              border-right: 5px solid #ffffff;
          }
  
          .dropping-point {
              width: 100%;
              height: 155px;
          }
  
          .sub-heading {
              width: 100%;
              height: auto;
              background-color: #c5c5c5c5;
              text-align: left;
          }
  
          .sub-heading p {
              padding: 5px 12px;
              font-weight: 600;
              font-size: 18px;
              line-height: 16.94px;
              letter-spacing: 0%;
  
          }
  
          .boarding-date {
              padding: 2px 12px;
              font-weight: 600;
              font-size: 18px;
              line-height: 1px;
              letter-spacing: 0%;
  
          }
  
          .boarding-place {
              padding: 2px 12px;
              font-weight: 500;
              font-size: 16px;
              line-height: 20px;
              letter-spacing: 1px;
              color: #393939;
          }
  
          .dropping-heading {
              width: 100%;
              height: auto;
              background-color: #c5c5c5c5;
              text-align: right;
          }
  
          .dropping-heading p {
              padding: 5px 12px;
              font-weight: 600;
              font-size: 18px;
              line-height: 16.94px;
              letter-spacing: 1px;
          }
  
          .dropping-date {
              padding: 2px 12px;
              font-weight: 600;
              font-size: 18px;
              line-height: 1px;
              letter-spacing: 1px;
              text-align: right;
          }
  
          .dropping-place {
              padding: 2px 12px;
              font-weight: 500;
              font-size: 16px;
              line-height: 20px;
              letter-spacing: 1px;
              text-align: right;
              color: #393939;
          }
  
          .travel-area {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 0 5px;
              width: 70%;
              margin: -20px auto
          }
  
          .from,
          .to {
              font-weight: 800;
              font-size: 35px;
              letter-spacing: 5%;
          }
  
          .circle {
              width: 10px;
              height: 10px;
              background-color: #393939;
              border-radius: 50%;
              margin-top: -5px;
          }
  
          .line {
              width: 40px;
              height: 2px;
              border-top: 2px dashed #393939;
              margin-top: -5px;
          }
  
          .bus {
              display: flex;
              justify-content: center;
              align-items: center;
              margin: -10px auto
          }
  
          .arrow {
              width: 0;
              height: 0;
              border-left: 15px solid #393939;
              border-top: 8px solid transparent;
              border-bottom: 8px solid transparent;
              margin-top: -6px;
          }
  
          .other-details {
              width: 100%;
              height: auto;
              display: flex;
              justify-content: center;
              align-items: center;
          }
  
          .left-side {
              width: 100%;
              height: 100%;
              border-right: 5px solid #ffffff;
          }
  
          .right-side {
              width: 100%;
              height: 540px;
          }
  
          .passenger-details {
              width: 100%;
              height: 235px;
              border-bottom: 5px solid #ffffff;
          }
  
          .passenger-label {
              width: 100%;
              height: auto;
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-top: -10px;
          }
  
          .travellers-details {
              width: 100%;
              height: auto;
              display: flex;
              justify-content: space-between;
              align-items: center;
          }
  
          .cancellation {
              width: 100%;
              height: auto;
              border-bottom: 5px solid #ffffff;
              padding-bottom: 5px;
          }
  
          .cancellation-label {
              width: 100%;
              height: auto;
              display: flex;
              justify-content: space-between;
              align-items: center;
          }
  
          .cancellation-details {
              width: 100%;
              height: auto;
              display: flex;
              justify-content: space-between;
              align-items: center;
          }
  
          .contact-us {
              width: 100%;
              height: auto;
          }
  
          .connect {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 0 30px;
          }
  
          .connect p {
              font-weight: 600;
              font-size: 16px;
              line-height: 12.1px;
              letter-spacing: 0%;
              color: #717171;
          }
  
          .connect img {
              width: 20px;
              height: 20px;
              color: #717171;
          }
  
          .Copyright {
              text-align: center;
              padding: 0 20px;
          }
  
          .Copyright p {
              font-weight: 600;
              font-size: 11px;
              line-height: 9.68px;
              letter-spacing: 0%;
              color: #717171;
          }
  
          .ticket-fare {
              width: 100%;
              height: auto;
              border-bottom: 5px solid #ffffff;
          }
  
          .fare {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding: 0 20px;
          }
  
          .name {
              font-weight: 600;
              font-size: 16px;
              line-height: 1px;
              letter-spacing: 0%;
              color: #838383;
          }
  
          .fare-details {
              font-weight: 600;
              font-size: 16px;
              line-height: 1px;
              letter-spacing: 0%;
              color: #393939;
          }
  
          .amount-paid {
              font-weight: 600;
              font-size: 14px;
              line-height: 1px;
              letter-spacing: 0%;
              color: #393939;
          }
  
          .amount {
              font-weight: 800;
              font-size: 16px;
              line-height: 1px;
              letter-spacing: 0%;
              color: #1F487C;
          }
  
          .Policy {
              width: 100%;
              height: 375px;
          }
  
          .Conditions {
              padding: 0 7px;
              margin-top: -10px;
          }
  
          .Conditions li {
              font-weight: 500;
              font-size: 14px;
              line-height: 20px;
              letter-spacing: 0%;
              text-align: left;
              color: #717171;
              margin-left: -15px;
              text-align: justify;
          }
  
          .Conditions strong {
              color: #393939;
          }
  
          @media (max-width: 998px) {
              .outer-border {
                  width: 98%;
                  height: auto;
              }
  
              .Conditions li {
                  line-height: 19px;
                  font-size: 12px;
              }
  
              .Copyright p {
                  font-size: 9px;
              }
  
              .Copyright {
              padding: 0 10px;
          }
  
              .travel-area {
                  margin: -10px auto
              }
  
              .from,
              .to {
                  font-size: 30px;
              }
          }
      </style>
  </head>
  
  <body>
      <div class="outer-border">
          <div class="festivel-banner">
              <img src="http://192.168.90.47:4001/public/pdf_image/Christmas.png" alt="" class="poster">
          </div>
          <div class="inner-border">
              <div class="booking-details">
                  <img src="http://192.168.90.47:4001/public/pdf_image/tbs.png" alt="" class="logo">
                  <div>
                      <div class="available">
                          <img src="http://192.168.90.47:4001/public/pdf_image/available.png" alt="" class="available_image">
                      </div>
                  </div>
              </div>
              <div class="ticket-booking-details">
                  <div class="ticket-no">
                      <p><span>TBSBus Booking ID:</span> ${ticket_no}</p>
                      <p><span>Bus Partner PNR:</span> ${pnr_no}</p>
                  </div>
                  <div class="source-to-destination">
                      <p class="source">thebusstand.com Ticket</p>
                      <p class="busstart">Booked on ${bookingDateTime}</p>
                  </div>
              </div>
              <div class="travels-details">
                  <div class="travels-operator">
                      <p class="travelsname">${operator_name}</p>
                      <p class="bustype">2 + 1 (32) GRAND SLEEPER,AC, LED NEW- AC</p>
                  </div>
                  <div class="ticket-time">
                      <p class="service-no">Service No. SVR 0909 - SPL</p>
                      <p class="bus-start">Bus Start Time:${departureTime}</p>
                  </div>
              </div>
              <div class="boarding-dropping">
                  <div class="boarding-point">
                      <div class="sub-heading">
                          <p>Bording Point & Time</p>
                      </div>
                      <p class="boarding-date">${departureDate} - ${departureTime}</p>
                      <p class="boarding-place">${pickup_point_name}</p>
                  </div>
                  <div class="duration">
                      <div class="travel-area">
                          <p class="from">${abbreviation1}</p>
                          <p class="to">${abbreviation2}</p>
                      </div>
                      <div class="bus">
                          <div class="circle"></div>
                          <div class="line"></div>
                          <svg width="75" height="40" viewBox="0 0 75 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path
                                  d="M7.20526 0.350586C3.6963 0.350586 0.882812 3.22788 0.882812 6.81641V26.6416C0.882812 28.1909 2.13873 29.4468 3.68797 29.4468H8.57673C8.57673 32.019 9.5759 34.486 11.3544 36.3048C13.133 38.1237 15.5452 39.1455 18.0604 39.1455C20.5756 39.1455 22.9878 38.1237 24.7664 36.3048C26.5449 34.486 27.5441 32.019 27.5441 29.4468H49.2543C49.2543 32.019 50.2535 34.486 52.0321 36.3048C53.8106 38.1237 56.2228 39.1455 58.738 39.1455C61.2532 39.1455 63.6654 38.1237 65.444 36.3048C67.2225 34.486 68.2217 32.019 68.2217 29.4468H71.739C73.2882 29.4468 74.5441 28.1909 74.5441 26.6416V6.81641C74.5441 3.22788 71.7306 0.350586 68.2217 0.350586H7.20526ZM18.0604 24.5974C19.318 24.5974 20.5241 25.1083 21.4134 26.0178C22.3026 26.9272 22.8022 28.1607 22.8022 29.4468C22.8022 30.7329 22.3026 31.9664 21.4134 32.8758C20.5241 33.7852 19.318 34.2962 18.0604 34.2962C16.8028 34.2962 15.5967 33.7852 14.7074 32.8758C13.8182 31.9664 13.3186 30.7329 13.3186 29.4468C13.3186 28.1607 13.8182 26.9272 14.7074 26.0178C15.5967 25.1083 16.8028 24.5974 18.0604 24.5974ZM58.738 24.5974C59.9956 24.5974 61.2017 25.1083 62.091 26.0178C62.9803 26.9272 63.4798 28.1607 63.4798 29.4468C63.4798 30.7329 62.9803 31.9664 62.091 32.8758C61.2017 33.7852 59.9956 34.2962 58.738 34.2962C57.4804 34.2962 56.2743 33.7852 55.385 32.8758C54.4958 31.9664 53.9962 30.7329 53.9962 29.4468C53.9962 28.1607 54.4958 26.9272 55.385 26.0178C56.2743 25.1083 57.4804 24.5974 58.738 24.5974Z"
                                  fill="#393939" />
                              <text x="50%" y="40%" font-size="14" fill="white" font-weight="600" text-anchor="middle"
                                  dominant-baseline="middle">${durations}</text>
                          </svg>
  
                          <div class="line"></div>
                          <div class="arrow"></div>
                      </div>
                  </div>
                  <div class="dropping-point">
                      <div class="dropping-heading">
                          <p>Dropping Point & Time</p>
                      </div>
                      <p class="dropping-date">${arrivalDate} - ${arrivalTime}</p>
                      <p class="dropping-place">${droping_point_name}</p>
                  </div>
              </div>
              <div class="other-details">
                  <div class="left-side">
                      <div class="passenger-details">
                          <div class="boarding-point">
                              <div class="sub-heading">
                                  <p>Passenger Details</p>
                              </div>
                              <div class="passenger-label">
                                  <div style="padding-left: 10px; width: 100%; text-align: left; line-height: 1px;">
                                      <p style="font-weight: 600; font-size: 14px; color: #717171;">Traveller Name</p>
  
                                  </div>
                                  <div
                                      style="padding-right: 20px; line-height: 0.2;width: 30%; text-align: center; line-height: 1px;">
                                      <p style="font-weight: 600; font-size: 14px; color: #717171;">Gender</p>
  
                                  </div>
                                  <div style="padding-right: 20px; width: 10%; text-align: center; line-height: 1px; ">
                                      <p style="font-weight: 600; font-size: 14px; color: #717171;">Age</p>
  
                                  </div>
                                  <div style="padding-right: 20px; width: 30%; text-align: center; line-height: 1px;">
                                      <p style="font-weight: 600; font-size: 14px; color: #717171;">Seat No</p>
                                  </div>
                              </div>
                             <div style="width: 100%; height: 100%; display: flex; flex-direction: column; justify-content: center; align-items: center; margin-top: -18px;">
                              ${passenger}
                              </div>
                          </div>
                      </div>
                      <div class="cancellation">
                          <div class="sub-heading">
                              <p>Cancellation Policy</p>
                          </div>
                          <div class="cancellation-label">
                              <div style="padding-left: 10px; width: 100%; text-align: left; line-height: 1px;">
                                  <p style="font-weight: 600; font-size: 14px; color: #717171;">Cancellation Time</p>
  
                              </div>
                              <div
                                  style="padding-right: 20px; line-height: 0.2;width: 50%; text-align: center; line-height: 1px;">
                                  <p style="font-weight: 600; font-size: 14px; color: #717171;">Refund(%)</p>
  
                              </div>
                              <div style="padding-right: 20px; width: 70%; text-align: center; line-height: 1px; ">
                                  <p style="font-weight: 600; font-size: 14px; color: #717171;">Refund Amount</p>
  
                              </div>
                          </div>
                          <div class="cancellation-details">
                              <div style="padding-left: 10px; width: 100%; text-align: left; line-height: 1px;">
                                  <p style="font-weight: 400; font-size: 12px; color: #717171;">Before 29-May 18:30</p>
                              </div>
                              <div
                                  style="padding-right: 20px; line-height: 0.2;width: 50%; text-align: center; line-height: 1px;">
                                  <p style="font-weight: 400; font-size: 12px; color: #393939;">85%</p>
                              </div>
                              <div style="padding-right: 20px; width: 70%; text-align: center; line-height: 1px; ">
                                  <p style="font-weight: 400; font-size: 12px; color: #393939;">Rs.1454</p>
                              </div>
                          </div>
                          <div class="cancellation-details">
                              <div style="padding-left: 10px; width: 100%; text-align: left; line-height: 18px;">
                                  <p style="font-weight: 400; font-size: 12px; color: #717171;">Between 29-May 18:30 &
                                      30-May 12:30</p>
                              </div>
                              <div
                                  style="padding-right: 20px; line-height: 0.2;width: 50%; text-align: center; line-height: 1px;">
                                  <p style="font-weight: 400; font-size: 12px; color: #393939;">70%</p>
                              </div>
                              <div style="padding-right: 20px; width: 70%; text-align: center; line-height: 1px; ">
                                  <p style="font-weight: 400; font-size: 12px; color: #393939;">Rs.1197</p>
                              </div>
                          </div>
                          <div class="cancellation-details">
                              <div style="padding-left: 10px; width: 100%; text-align: left; line-height: 1px;">
                                  <p style="font-weight: 400; font-size: 12px; color: #717171;">Before 29-May 18:30</p>
                              </div>
                              <div
                                  style="padding-right: 20px; line-height: 0.2;width: 50%; text-align: center; line-height: 1px;">
                                  <p style="font-weight: 400; font-size: 12px; color: #393939;">0%</p>
                              </div>
                              <div style="padding-right: 20px; width: 70%; text-align: center; line-height: 1px; ">
                                  <p style="font-weight: 400; font-size: 12px; color: #393939;">Rs.0</p>
                              </div>
                          </div>
                      </div>
                      <div class="contact-us">
                          <div class="connect">
                              <p>Connect with us</p>
                              <a href="https://thebusstand.com/"><img src="http://192.168.90.47:4001/public/pdf_image/Web.png" alt="web"></a>
                              <a href=""><img src="http://192.168.90.47:4001/public/pdf_image/fb.png" alt="fb"></a>
                              <a href=""><img src="http://192.168.90.47:4001/public/pdf_image/insta.png" alt="insta"></a>
                              <a href=""><img src="http://192.168.90.47:4001/public/pdf_image/x.png" alt="x"></a>
  
                          </div>
                          <div class="Copyright">
                              <p>Copyright thebusstand.com | Powered by Ra Travel Tech. | All Rights Reserved.</p>
                          </div>
                      </div>
                  </div>
                  <div class="right-side">
                      <div class="ticket-fare">
                          <div class="sub-heading">
                              <p>Payment Details</p>
                          </div>
                          <div class="fare">
                              <p class="name">Basic Fare</p>
                              <p class="fare-details">${base_fare}</p>
                          </div>
                          <div class="fare">
                              <p class="name">Bus Partner GST</p>
                              <p class="fare-details">86.00</p>
                          </div>
                          <div class="fare">
                              <p class="amount-paid">Amount Paid</p>
                              <p class="amount">₹${total_fare}</p>
                          </div>
                      </div>
                      <div class="Policy">
                          <div class="sub-heading">
                              <p>Terms & Conditions</p>
                          </div>
                          <div class="Conditions">
                              <ul>
                                  <li>The <strong>arrival and departure times </strong>mentioned on the ticket are
                                      <strong>tentative </strong>and subject to
                                      change.
                                  </li>
                                  <li>Passengers are requested to <strong>arrive at the boarding point at least 15
                                          minutes</strong> before the
                                      scheduled departure time.</li>
                                  <li><strong>theBusStand.com is not responsible </strong>for any accidents or loss of
                                      passenger belongings.
                                  </li>
                                  <li><strong>theBusStand.com is not liable</strong> for any delays or inconveniences
                                      during the journey due to
                                      vehicle breakdowns or other circumstances beyond our control.</li>
                                  <li>If a <strong>bus service is canceled</strong>, for tickets booked through
                                      <strong>theBusStand.com</strong>, the refund
                                      amount will be credited back to the passenger’s <strong>Credit/Debit Card or Bank
                                          Account</strong> used
                                      for booking.
                                  </li>
                                  <li><strong>Cancellation charges</strong> are applicable on the <strong>original
                                          fare</strong> but not on the <strong>discounted fare</strong>.
                                  </li>
                                  <li>Any <strong>complaints or grievances</strong> related to the journey should be
                                      reported within <strong>seven days</strong>
                                      from the date of travel.</li>
                              </ul>
                          </div>
                      </div>
  
                  </div>
              </div>
          </div>
      </div>
  </body>
  
  </html>
  `;
  
  //   const browser = await puppeteer.launch();
  //   const page = await browser.newPage();
  //   const pdfPath = path.resolve(
  //     __dirname,
  //     "..",
  //     "public",
  //     "Ticket_image",
  //     `${ticket_no}.pdf`
  //   );
  //   await page.setContent(htmlContent, { waitUntil: "load" });
  //   await page.pdf({
  //     path: pdfPath,
  //     format: "A4",
  //     printBackground: true,
  //   });
  //   await browser.close();
  
  const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
    await browser.close();
  
    const template = bustype === false ? regularTickets : luxuryTickets;
  
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        user: "tickets@thebusstand.com",
        pass: "smxhcrbcpftfwgcy",
      },
    });
  
    const mailOptions = {
      from: '"The Bus Stand" <tickets@thebusstand.com>',
      to: email,
      subject: `Booking Confirmation - ${ticket_no}`,
      html: template,
      attachments: [
          {
              filename: `${ticket_no}.pdf`,
              content: pdfBuffer,
              contentType: "application/pdf",
           },
      ],
    };
  
    try {
      await transporter.sendMail(mailOptions);
      console.log("Email sent successfully to:", email);
    } catch (error) {
      console.error("Error sending email:", error);
    }
  };
  
const getCityAbbreviation = (cityName) => {
  if (!cityName) return "";
  const words = cityName.split(" ");
  if (words.length > 1) {
    return words
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase();
  }

  const letters = cityName.toUpperCase().replace(/[^A-Z]/g, "");
  const vowels = ["A", "E", "I", "O", "U"];

  let abbreviation = letters.charAt(0);
  let consonants = letters
    .split("")
    .filter((letter) => !vowels.includes(letter));

  abbreviation += (consonants[1] || letters[1] || "").charAt(0);
  abbreviation += (consonants[2] || letters[2] || "").charAt(0);

  return abbreviation;
};

exports.getTicketBookingHistoryById = async (req, res) => {
    try {
        const { ticket_no } = req.params;

        if (!ticket_no) {
            return res.status(400).json({ message: "Please provide the booking ID" });
        }

        const { rows } = await tbsWebPool.query(
            'SELECT * FROM public."TBS_Booking_Transaction" WHERE "ticket_no" = $1',
            [ticket_no]
        );

        res.status(200).json({ 
            message: rows.length ? "Data fetched successfully" : "No bookings found", 
            data: rows 
        });

    } catch (error) {
        console.error("Database query failed:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
};

exports.getDiscountOffer = async (req, res) => {
    try {
        const { user_id, email, mobile } = req.body;

        if (!user_id && !email && !mobile) {
            return res.status(400).json({ message: "Please provide at least one search parameter (user_id, email, or mobile)" });
        }

        let query = 'SELECT offer_code FROM public."TBS_Booking_Transaction" WHERE ';
        let conditions = [];
        let values = [];

        if (user_id) {
            conditions.push('"login_user_id" = $' + (values.length + 1));
            values.push(user_id);
        }
        if (email) {
            conditions.push('"email" = $' + (values.length + 1));
            values.push(email);
        }
        if (mobile) {
            conditions.push('"mobile" = $' + (values.length + 1));
            values.push(mobile);
        }

        query += conditions.join(" OR ");

        const { rows } = await tbsWebPool.query(query, values);
        const data = await tbsCrmPool.query(
            'SELECT * FROM public.discount_offers',
          );
      
          const usedOffers = rows;
          const allOffers = data.rows
          const usedOfferCodes = new Set(usedOffers.map(item => item.offer_code)) 
          const nonUsedOffer = allOffers.filter(item => !usedOfferCodes.has(item.code))
         res.status(200).json({data:nonUsedOffer})
          
    } catch (error) {
        console.error("Database query failed:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }

};

exports.discountOfferValid = async (req, res) => {
    const { user_id, email, mobile, code } = req.body;
    try {
      let query = `SELECT * FROM public."TBS_Booking_Transaction" WHERE `;
      let condition = [];
      let values = [];
  
      if (user_id) {
        condition.push('"login_user_id" = $' + (values.length + 1));
        values.push(user_id);
      }
      if (email) {
        condition.push('"email" = $' + (values.length + 1));
        values.push(email);
      }
      if (mobile) {
        condition.push('"mobile" = $' + (values.length + 1));
        values.push(mobile);
      }
  
      query += condition.join(" OR ");
  
      const result = await tbsWebPool.query(query, values);
      const dbcode = result.rows
      const response = dbcode.every(offers => offers.offer_code.toLowerCase() !== code.toLowerCase());
      res.json({data:response });
    } catch (error) {
      console.error("Error on processing the data:", error);
      res
        .status(500)
        .json({ message: "Internal Server Error", error: error.message });
    }
  };