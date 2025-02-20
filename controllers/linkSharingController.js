const { tbsWebPool } = require('../config/dbconfig')
const nodemailer = require('nodemailer')

// Configure Nodemailer for sending OTP emails
const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    secure: false,
    auth: {
      user: 'no-reply@thebusstand.com',
      pass: 'bdqbqlgqgcnnrxrr',
    },
  })

const ShareAppLink = async (req, res) => {
    const { email_id, mobile_number, android_link, iphone_link } = req.body;
  
    if (!email_id || mobile_number) {
      return res.status(400).json({ message: 'Email and mobile number are required.' });
    }
  
    try {
      const query = `
        INSERT INTO public.app_link_sharing (email_id, mobile_number, "sendAt")
        VALUES ($1, $2, NOW())
        RETURNING *;`;
      const values = [email_id, mobile_number];
  
      const result = await tbsWebPool.query(query, values);
  
      const mailOptions = {
        from: 'no-reply@thebusstand.com',
        to: email_id,
        subject: 'Your Links',
        text: `Here are your links:\nAndroid: ${android_link}\niPhone: ${iphone_link}`,
      };
  
      await transporter.sendMail(mailOptions);
  
      res.status(201).json({
        message: 'Link shared successfully.',
        data: result.rows[0],
      });
    } catch (error) {
      console.error('Error sharing link:', error);
      res.status(500).json({ message: 'Internal server error.' });
    }
  }

  module.exports = { ShareAppLink }