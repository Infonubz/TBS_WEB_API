const crypto = require('crypto');
const Razorpay = require("razorpay");
require("dotenv").config();

exports.razorPayOrder = async(req,res) =>{
    try {
        const razorpay = new Razorpay({
          key_id: process.env.RAZORPAY_ID,
          key_secret: process.env.RAZORPAY_SECRET_KEY,
        });
    
        const options = req.body;
        const order = await razorpay.orders.create(options);
    
        if (!order) {
          return res.status(500).send("Error");
        }
    
        res.json(order);
      } catch (err) {
        console.log(err);
        res.status(500).send("Error");
      }
}


exports.orderValid = async(req,res) =>{
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
    req.body;

  const sha = crypto.createHmac("sha256", process.env.CRYPTO_SECRET_KEY);
  //order_id + "|" + razorpay_payment_id
  sha.update(`${razorpay_order_id}|${razorpay_payment_id}`);
  const digest = sha.digest("hex");
  if (digest !== razorpay_signature) {
    return res.status(400).json({ msg: "Transaction is not legit!" });
  }

  res.json({
    msg: "success",
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
  });
}