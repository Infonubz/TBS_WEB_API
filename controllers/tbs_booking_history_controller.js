const { tbsWebPool } = require('../config/dbconfig')


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
} = req.body;

const client = await tbsWebPool.connect();

try {
  await client.query("BEGIN");

  const passengerJson = JSON.stringify(passenger_details);
  
  const bookingQuery = `
        INSERT INTO public."TBS_Booking_Transaction" 
        (name, email, mobile, ticket_no, pnr_no, payment_status, login_user_id, login_user_email, login_user_mobile, source_id, source_name, pickup_point_id, pickup_point_name, depature_date, depature_time, destination_id, destination_name, droping_point_id, droping_point_name, arrival_date, arraival_time, operator_id, operator_name, passenger_details) 
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
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
  ]);

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

  await client.query("COMMIT");

  res.status(200).json({ message: "Transaction successfully recorded" });
} catch (error) {
  await client.query("ROLLBACK");
  console.error("Transaction failed:", error);
  res.status(500).json({ message: "Internal server error" });
} finally {
  client.release();
}
}