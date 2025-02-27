const { tbsWebPool } = require('../config/dbconfig');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const secret = crypto.randomBytes(32).toString('hex');

// Configure Nodemailer for sending OTP emails
const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false,
  auth: {
    user: 'info@thebusstand.com',
    pass: 'bxdmbylxzlgcnbcn', 
  },
});

const OTP_EXPIRATION_TIME = 10 * 60 * 1000; 

// Function to generate OTP
function generateOTP() {
  const otp = Math.floor(100000 + Math.random() * 900000);
  const expirationTime = Date.now() + OTP_EXPIRATION_TIME;
  return { otp, expirationTime };
}

// Map to store OTPs temporarily
const otpMap = new Map();

// Function to send OTP email
const sendOTPEmail = async (email_id, otp) => {
  const mailOptions = {
    from: 'info@thebusstand.com',
    to: email_id,
    subject: 'Login OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 15px;">
        <div style="background-color: #1F487C; padding: 10px; border-radius: 10px 10px 0 0; text-align: center; color: #fff;">
          <a href="www.redbus.in" style="color: #FFFFFF;font-size: 22px; font-weight: 600 ;margin: 0;">THEBUSSTAND.COM</a>
        </div>
        <div style="padding: 20px; background-color: #ffffff; text-align: center; border: 3px solid #1F487C; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1F487C; font-size: 22x; margin-bottom: 8px;">Login OTP</h2>
          <p style="font-size: 16px; color: #1F487C; margin-bottom: 15px;">
            Your OTP for Login is:
          </p>
          <div style="font-size: 24px; color: #1F487C; font-weight: 900; border: 2px dashed #1F487C; background-color: #D2DAE5; border-radius: 10px; padding: 8px 15px; margin-bottom: 10px;">
            ${otp}
          </div>
          <p style="font-size: 12px; color: #777; margin-bottom: 5px;">
            Please copy the OTP above & paste it into the Login form on our Website.
          </p>
          <p style="font-size: 12px; color: #777; margin-bottom: 5px;">
            This OTP will expire in 10 minutes.
          </p>
        </div>
        <div style="padding: 10px; background-color: #D2DAE5; text-align: center; border-radius: 0 0 10px 10px;">
          <p style="font-size: 12px; color: #999; margin: 0;">
            This email was sent by TheBusStand No-reply.
          </p>
          <p style="font-size: 12px; color: #999; margin: 5px 0 0 0;">
            © 2024 TheBusStand. All rights reserved.
          </p>
        </div>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

// Function to store passenger profile in the database
const storePassengerProfile = async (email_id, mobile_number) => {
  try {
    const query = `
      INSERT INTO passenger_profile (email_id, mobile_number)
      VALUES ($1, $2)
      ON CONFLICT (email_id) DO UPDATE
      SET mobile_number = EXCLUDED.mobile_number RETURNING tbs_passenger_id
    `;
    const result = await tbsWebPool.query(query, [email_id, mobile_number]);
    return result.rows[0].tbs_passenger_id;
  } catch (error) {
    console.error('Error saving passenger profile:', error);
    throw error;
  }
};

// Function for passenger login
const PassengerLogin = async (req, res) => {
  try {
    const { email_id, mobile_number } = req.body;

    if (!email_id && !mobile_number) {
      return res.status(400).json({ error: 'Email or mobile number is required' });
    }

    const query = `SELECT * FROM passenger_profile WHERE email_id = $1 OR mobile_number = $2`;
    const result = await tbsWebPool.query(query, [email_id, mobile_number]);

    if (result.rows.length > 0) {
      const { otp, expirationTime } = generateOTP();
      otpMap.set(email_id || mobile_number, { otp, expirationTime });

      if (email_id) {
        await sendOTPEmail(email_id, otp);
        return res.status(200).json({ message: 'OTP sent to your email', email_id });
      } else {
        return res.status(200).json({ message: 'OTP sent to your mobile number', mobile_number });
      }
    } else {
      
      const { otp, expirationTime } = generateOTP();
      otpMap.set(email_id || mobile_number, { otp, expirationTime });
      
      if (email_id) {
        await sendOTPEmail(email_id, otp);
        return res.status(200).json({ message: 'OTP sent to your email, please verify to complete registration' });
      }
      return res.status(200).json({ message: 'OTP sent to your mobile, please verify to complete registration' });
    }
  } catch (error) {
    console.error('Error during login process:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};

// Function to verify OTP
const VerifyOTP = async (req, res) => {
  try {
    const { email_id, otp, mobile_number } = req.body;

    if ((!email_id && !mobile_number) || !otp) {
      return res.status(400).json({ error: 'Email/Mobile number and OTP are required' });
    }

    const otpDetails = otpMap.get(email_id || mobile_number);

    if (!otpDetails) {
      return res.status(400).json({ error: 'OTP not found or expired' });
    }

    const { otp: storedOTP, expirationTime } = otpDetails;

    if (Date.now() > expirationTime) {
      otpMap.delete(email_id || mobile_number);
      return res.status(400).json({ error: 'OTP has expired' });
    }

    if (parseInt(otp, 10) === storedOTP) {
      otpMap.delete(email_id || mobile_number);

      const query = `SELECT * FROM passenger_profile WHERE email_id = $1 OR mobile_number = $2`;
      const result = await tbsWebPool.query(query, [email_id, mobile_number]);

      if (result.rows.length === 0) {
        const tbs_passenger_id = await storePassengerProfile(email_id, mobile_number);

        const token = jwt.sign(
          { tbs_passenger_id, email_id, mobile_number },
          secret,
          { expiresIn: '1h' } 
        );

        return res.status(201).json({
          message: 'New user created and OTP verified',
          user: {
            tbs_passenger_id,
            email_id: email_id || null,
            mobile_number: mobile_number || null,
            status: (email_id && mobile_number) ? 2 : 1,
          },
          token,
        });
      } else {
        const user = result.rows[0];
        const status = (user.email_id !== null && user.mobile_number !== null) ? 2 : 1;

        const token = jwt.sign(
          { tbs_passenger_id: user.tbs_passenger_id, email_id: user.email_id, mobile_number: user.mobile_number },
          process.env.JWT_SECRET,
          { expiresIn: '1h' } 
        );

        return res.status(200).json({
          message: 'OTP verified and login successful',
          user: {
            tbs_passenger_id: user.tbs_passenger_id,
            email_id: user.email_id,
            mobile_number: user.mobile_number,
            ...user,
            status: status,
          },
          token, 
        });
      }
    } else {
      return res.status(400).json({ error: 'Invalid OTP' });
    }
  } catch (error) {
    console.error('Error during OTP verification:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}

module.exports = { PassengerLogin, VerifyOTP };
