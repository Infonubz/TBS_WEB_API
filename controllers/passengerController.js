const {tbsWebPool} = require('../config/dbconfig')
const nodemailer = require('nodemailer')

// POST CONTROLLER OF WEB PASSENGER DETAILS
const passengerPost = async (req, res) => {
    const { user_name, date_of_birth, gender, email_id, mobile_number, state, state_id, age, occupation, occupation_id } = req.body;

    if (!user_name || !date_of_birth || !gender || !email_id || !mobile_number || !state || !state_id || !age) {
        console.log('Missing required fields');
        return res.status(400).json({ message: "Missing required fields" });
    }

    try {
      
        const checkQuery = `SELECT * FROM public.passenger_profile WHERE email_id = $1 OR mobile_number = $2`;
        const checkResult = await tbsWebPool.query(checkQuery, [email_id, mobile_number]);

        if (checkResult.rows.length > 0) {
          
            return res.status(409).json({ message: "Email or mobile number already exists" });
        }

        const passengerQuery = `INSERT INTO public.passenger_profile(
            user_name, date_of_birth, gender, email_id, mobile_number, state, state_id, age, occupation, occupation_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

        const passengerValues = [user_name, date_of_birth, gender, email_id, mobile_number, state, state_id, age, occupation, occupation_id];

        await tbsWebPool.query(passengerQuery, passengerValues);

        res.status(201).json({ message: "Passenger Details Created Successfully" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Database error" });
    }
}

// PUT CONTROLLER OF WEB PASSENGER DETAILS
const passengerPut = async (req, res) => {
  const { user_name, date_of_birth, gender, email_id, mobile_number, state, state_id, age, occupation, occupation_id, user_status } = req.body;
  const passengerId = req.params.tbs_passenger_id;

  const fieldsToUpdate = [];
  const values = [];

  if (user_name) {
    fieldsToUpdate.push(`user_name = $${values.length + 1}`);
    values.push(user_name);
  }
  if (date_of_birth) {
    fieldsToUpdate.push(`date_of_birth = $${values.length + 1}`);
    values.push(date_of_birth);
  }
  if (gender) {
    fieldsToUpdate.push(`gender = $${values.length + 1}`);
    values.push(gender);
  }
  if (email_id) {
    fieldsToUpdate.push(`email_id = $${values.length + 1}`);
    values.push(email_id);
  }
  if (mobile_number) {
    fieldsToUpdate.push(`mobile_number = $${values.length + 1}`);
    values.push(mobile_number);
  }
  if (state) {
    fieldsToUpdate.push(`state = $${values.length + 1}`);
    values.push(state);
  }
  if (state_id) {
    fieldsToUpdate.push(`state_id = $${values.length + 1}`);
    values.push(state_id);
  }
  if (age) {
    fieldsToUpdate.push(`age = $${values.length + 1}`);
    values.push(age);
  }
  if (occupation) {
    fieldsToUpdate.push(`occupation = $${values.length + 1}`);
    values.push(occupation);
  }
  if (occupation_id) {
    fieldsToUpdate.push(`occupation_id = $${values.length + 1}`);
    values.push(occupation_id);
  }
  if (user_status) {
    fieldsToUpdate.push(`user_status = $${values.length + 1}`);
    values.push(user_status);
  }

  if (fieldsToUpdate.length === 0) {
    return res.status(400).json({ message: "No fields provided for update" });
  }

  try {
    const passengerQuery = `UPDATE public.passenger_profile
    SET ${fieldsToUpdate.join(', ')}
    WHERE tbs_passenger_id = $${values.length + 1}`;
    values.push(passengerId);
    const result = await tbsWebPool.query(passengerQuery, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Passenger not found' });
    }

    const bookingHistory = `
    UPDATE public."TBS_Booking_Transaction" 
    SET name = $1 
    WHERE login_user_id = $2 
    AND name IS DISTINCT FROM $1
    RETURNING *;`;
    const value = [user_name, passengerId]; 
    await tbsWebPool.query(bookingHistory, value);

    // Check for referral code
    const checkReferralQuery = `
    SELECT referral_code, user_name, mobile_number, email_id, date_of_birth, gender, state, age, occupation
    FROM passenger_profile 
    WHERE tbs_passenger_id = $1
    `;
    const referralResult = await tbsWebPool.query(checkReferralQuery, [passengerId]);

    if (referralResult.rows.length === 0) {
      return res.status(404).json({ message: 'Passenger not found' });
    }

    const { referral_code, user_name: passengerName, mobile_number: passengerMobile, email_id, date_of_birth, gender, state, age, occupation } = referralResult.rows[0];

    if (!referral_code && passengerName && passengerMobile && email_id && date_of_birth && gender && state && age && occupation) {
      const newReferralCode = generateReferralCode(passengerName, passengerMobile);

      const updateReferralQuery = `UPDATE public.passenger_profile SET referral_code = $1 WHERE tbs_passenger_id = $2`;
      await tbsWebPool.query(updateReferralQuery, [newReferralCode, passengerId]);
      console.log(`Generated referral code for passenger: ${newReferralCode}`);
    }

    // Send registration email if user status is 'register'
    if (user_status && user_status.toLowerCase() === 'register') {
      const passengerEmailQuery = `SELECT email_id FROM public.passenger_profile WHERE tbs_passenger_id = $1`;
      const passengerEmailResult = await tbsWebPool.query(passengerEmailQuery, [passengerId]);

      if (passengerEmailResult.rows.length > 0) {
        const emailToSend = passengerEmailResult.rows[0].email_id;

        const transporter = nodemailer.createTransport({
          host: 'smtp.office365.com',
          port: 587,
          secure: false,
          auth: {
            user: 'no-reply@thebusstand.com',
            pass: 'bdqbqlgqgcnnrxrr',
          },
        });

        const mailOptions = {
          from: '"The Bus Stand" <no-reply@thebusstand.com>',
          to: emailToSend,
          subject: 'Registration Successful',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 15px;">
              <div style="background-color: #1F487C; padding: 10px; border-radius: 10px 10px 0 0; text-align: center; color: #fff;">
                <a href="www.redbus.in" style="color: #FFFFFF; font-size: 22px; font-weight: 600; margin: 0;">THEBUSSTAND.COM</a>
              </div>
              <div style="padding: 20px; background-color: #ffffff; text-align: center; border: 3px solid #1F487C; border-radius: 0 0 10px 10px;">
                <h2 style="color: #1F487C; font-size: 22px; margin-bottom: 8px;">Registration Successful</h2>
                <p style="font-size: 16px; color: #1F487C; margin-bottom: 15px;">
                  Dear ${user_name}, you have successfully registered with The Bus Stand. Welcome aboard!
                </p>
              </div>
              <div style="padding: 10px; background-color: #D2DAE5; text-align: center; border-radius: 0 0 10px 10px;">
                <p style="font-size: 12px; color: #999; margin: 0;">
                  This email was sent by TheBusStand No-reply.
                </p>
              </div>
            </div>`
        };
        await transporter.sendMail(mailOptions);
      }
    }

    res.status(200).json({ message: "Passenger Details Updated Successfully" });
  } catch (error) {
    if (error.code === '23505' && error.detail.includes('mobile_number')) {
      return res.status(400).json({ message: "Mobile number already exists. Please provide a different number." });
    }
    console.error(error);
    res.status(500).json({ message: error.message });
  }
}

// Helper function to generate the referral code
function generateReferralCode(userName, mobileNumber) {
  const firstTwoLetters = userName.slice(0, 2).toUpperCase();
  const lastFourDigits = mobileNumber.toString().slice(-4);
  const randomTenDigits = Math.floor(1000000000 + Math.random() * 9000000000);
  return `${firstTwoLetters}${lastFourDigits}${randomTenDigits}`;
}

// DELETE CONTROLLER OF WEB PASSENGER DETAILS
const passengerDelete = async (req, res) => {
    const passengerId = req.params.tbs_passenger_id;
    
    try {
        await tbsWebPool.query('BEGIN');

        const getPassengerQuery = `SELECT email_id, mobile_number FROM public.passenger_profile WHERE tbs_passenger_id = $1`;
        const passengerResult = await tbsWebPool.query(getPassengerQuery, [passengerId]);

        if (passengerResult.rows.length === 0) {
            return res.status(404).json('Passenger not found');
        }

        const { email, mobile_number } = passengerResult.rows[0];

        const deleteQueries = [
            `DELETE FROM public.booking_details WHERE email_id = $1 OR mobile_number = $2`,
            `DELETE FROM public.ticket_details WHERE email_id = $1 OR mobile_number = $2`,
            `DELETE FROM public.cancelled_tickets WHERE email_id = $1 OR mobile_number = $2`,
            `DELETE FROM public.upcoming_journey WHERE email_id = $1 OR mobile_number = $2`,
            `DELETE FROM public.compled_journey WHERE email_id = $1 OR mobile_number = $2`
        ];

        for (const query of deleteQueries) {
            await tbsWebPool.query(query, [email, mobile_number]);
        }

        const passengerQuery = `DELETE FROM public.passenger_profile WHERE tbs_passenger_id = $1`;
        await tbsWebPool.query(passengerQuery, [passengerId]);

        await tbsWebPool.query('COMMIT');

        res.status(200).json({ message: "Passenger details deleted successfully" });
    } catch (error) {
       
        await tbsWebPool.query('ROLLBACK');
        console.error(error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
}

// GET-ById CONTROLLER OF WEB PASSENGER DETAILS
const passengerGetById = async(req, res) =>{
    const passengerId = req.params.tbs_passenger_id
    try {
        const passengerQuery = `SELECT * FROM public.passenger_profile
	    WHERE tbs_passenger_id = $1`

        const passengerValues = [ passengerId]

        const result = await tbsWebPool.query(passengerQuery, passengerValues)

        if (result.length === 0) {
            return res.status(200).json('passenger is not found' )
        }

        res.status(201).json(result.rows[0])
    } catch (error) {
        console.error(error)
        res.status(200).json({message : error})
    }
}

// GET-ById CONTROLLER OF REFERREL CODE
const passengerReferrelCodeGetById = async(req, res) =>{
  const passengerId = req.params.tbs_passenger_id
  try {
      const passengerQuery = `SELECT referral_code FROM public.passenger_profile
    WHERE tbs_passenger_id = $1`

      const passengerValues = [ passengerId]

      const result = await tbsWebPool.query(passengerQuery, passengerValues)

      if (result.length === 0) {
          return res.status(200).json('passenger is not found' )
      }

      res.status(201).json(result.rows[0])
  } catch (error) {
      console.error(error)
      res.status(200).json({message : error})
  }
}

// DELETE CONTROLLER OF WEB PASSENGER DETAILS
const passengerGetAll = async(req, res) =>{
    try {
        const passengerQuery = `SELECT * FROM public.passenger_profile`

        const result = await tbsWebPool.query(passengerQuery)

        res.status(201).json(result.rows)
    } catch (error) {
        console.error(error)
        res.status(200).json({message : error})
    }
}

// POST CONTROLLER OF WEB ADD-PASSENGER DETAILS
const addpassengerPost = async (req, res) => {
    const { tbs_passenger_id, user_name, date_of_birth, gender, email_id, mobile_number, state, state_id, age } = req.body;
  
    if (!tbs_passenger_id || !user_name || !date_of_birth || !gender || !email_id || !mobile_number || !state || !state_id || !age) {
      console.log('Missing required fields');
      return res.status(400).json({ message: "Missing required fields" })
    }
  
    try {
      const passengerQuery = `INSERT INTO public.tkt_add_passengers_details(
        tbs_passenger_id, user_name, date_of_birth, gender, email_id, mobile_number, state, state_id, age)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`;
  
      const passengerValues = [tbs_passenger_id, user_name, date_of_birth, gender, email_id, mobile_number, state, state_id, age];
  
      const result = await tbsWebPool.query(passengerQuery, passengerValues);
  
      res.status(201).json({ message: "Passenger Details Created Successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Error in database connection" });
    }
  }  
    
// PUT CONTROLLER OF WEB ADD-PASSENGER DETAILS
const addpassengerPut = async(req, res) =>{
    const passengerId = req.params.tbs_add_pax_id
    const { tbs_passenger_id, user_name, date_of_birth, gender, email_id, mobile_number, state, state_id, age } = req.body
        
    if(!tbs_passenger_id || !user_name || !date_of_birth || !gender || !email_id || !mobile_number || !state || !state_id || !age){
         console.log('Missing required fields')
         return res.status(400).json({message : "Missing required fields"}) 
     }
        
    try {
        const passengerQuery = `UPDATE public.tkt_add_passengers_details
             SET tbs_passenger_id = $2, user_name= $3, date_of_birth= $4, gender= $5, email_id= $6, mobile_number= $7, state= $8, state_id= $9, age = $10
             WHERE tbs_add_pax_id = $1`
        
         const passengerValues = [passengerId, tbs_passenger_id, user_name, date_of_birth, gender, email_id, mobile_number, state, state_id, age]
        
        const result = await tbsWebPool.query(passengerQuery, passengerValues)
         console.log(req.body)
        
        if (result.rowCount === 0) { 
             return res.status(404).json({ message: 'Passenger not found' }) 
         }
        
          res.status(200).json({ message: "Passenger Details Updated Successfully" })
    } catch (error) {
         console.error(error)
         res.status(500).json({ message: "Error in database connection" })
    }
}    
    
// DELETE CONTROLLER OF WEB ADD-PASSENGER DETAILS
const addpassengerDelete = async(req, res) =>{
     const passengerId = req.params.tbs_add_pax_id
        try {
            const passengerQuery = `DELETE FROM public.tkt_add_passengers_details
            WHERE tbs_add_pax_id = $1`
    
            const passengerValues = [ passengerId]
    
            const result = await tbsWebPool.query(passengerQuery, passengerValues)
    
            if (result.length === 0) {
                return res.status(200).json('passenger is not found' )
            }
    
            res.status(201).json({message: "Passenger Details Deleted Succesfully"})
        } catch (error) {
            console.error(error)
            res.status(200).json({message : "error in to databse connection"})
        }
}
    
    // GET-ById CONTROLLER OF WEB ADD-PASSENGER DETAILS
    const addpassengerGetById = async(req, res) =>{
        const passengerId = req.params.tbs_add_pax_id
        try {
            const passengerQuery = `SELECT * FROM public.tkt_add_passengers_details
            WHERE tbs_add_pax_id = $1`
    
            const passengerValues = [ passengerId]
    
            const result = await tbsWebPool.query(passengerQuery, passengerValues)
    
            if (result.length === 0) {
                return res.status(200).json('passenger is not found' )
            }
    
            res.status(201).json(result.rows[0])
        } catch (error) {
            console.error(error)
            res.status(200).json({message : "error in to databse connection"})
        }
    }
    
    // GET CONTROLLER OF WEB ADD-PASSENGER DETAILS
    const addpassengerGetAll = async (req, res) => {
        try {
            const passengerQuery = `SELECT * FROM public.tkt_add_passengers_details`;
            const result = await tbsWebPool.query(passengerQuery);
            res.status(200).json(result.rows)
        } catch (error) {
            console.error(error);
            res.status(201).json({ message: "Error in database connection" })
        }
    }    

// GET-ById CONTROLLER OF WEB PASSENGERS AND ADD-PASSENGER DETAILS
   const AllpassengerSGetById = async (req, res) => {
    const { tbs_passenger_id } = req.params
  
    try {
      const query = `
        SELECT 
          p.tbs_passenger_id, 
          p.user_name AS passenger_user_name, 
          p.age AS passenger_age,
          p.date_of_birth AS passenger_date_of_birth, 
          p.gender AS passenger_gender, 
          p.email_id AS passenger_email_id, 
          p.mobile_number AS passenger_mobile_number, 
          p.state AS passenger_state, 
          p.state_id AS passenger_state_id, 
          ap.tbs_add_pax_id, 
          ap.user_name AS add_passenger_user_name, 
          ap.age AS add_passenger_age,
          ap.date_of_birth AS add_passenger_date_of_birth, 
          ap.gender AS add_passenger_gender, 
          ap.email_id AS add_passenger_email_id, 
          ap.mobile_number AS add_passenger_mobile_number, 
          ap.state AS add_passenger_state, 
          ap.state_id AS add_passenger_state_id
        FROM 
          public.passenger_profile p
        RIGHT JOIN 
          public.tkt_add_passengers_details ap
        ON 
          p.tbs_passenger_id = ap.tbs_passenger_id
        WHERE 
          p.tbs_passenger_id = $1;
      `;
  
      const result = await tbsWebPool.query(query, [tbs_passenger_id]);
  
      if (result.rows.length > 0) {
    
        const passengerProfile = {
          tbs_passenger_id: result.rows[0].tbs_passenger_id,
          user_name: result.rows[0].passenger_user_name,
          age: result.rows[0].passenger_age,
          date_of_birth: result.rows[0].passenger_date_of_birth,
          gender: result.rows[0].passenger_gender,
          email_id: result.rows[0].passenger_email_id,
          mobile_number: result.rows[0].passenger_mobile_number,
          state: result.rows[0].passenger_state,
          state_id: result.rows[0].passenger_state_id,
        }

        const addPassengerDetails = result.rows.map(row => ({
          tbs_add_pax_id: row.tbs_add_pax_id,
          user_name: row.add_passenger_user_name,
          age: row.add_passenger_age,
          date_of_birth: row.add_passenger_date_of_birth,
          gender: row.add_passenger_gender,
          email_id: row.add_passenger_email_id,
          mobile_number: row.add_passenger_mobile_number,
          state: row.add_passenger_state,
          state_id: row.add_passenger_state_id,
        }))
        res.status(200).json({
          passenger_profile: passengerProfile,
          add_passenger_details: addPassengerDetails,
        })
      } else {
        res.status(200).json({ message: 'Passenger not found' })
      }
    } catch (error) {
      console.error(error)
      res.status(500).json({ error: 'Internal Server Error' })
    }
  }

  //GET ALL PASSENGER EMAILID
  const getEmail = async (req, res) => {

    try {
        const query = `
                    SELECT 
                            tbs_passenger_id,
                            email_id
                    FROM 
                            passenger_profile`
        
        const result = await tbsWebPool.query(query);

        if (result.rowCount === 0) {
            return res.status(201).json({ error: 'passenger not found' });
        }

        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error geting operator-profile_img:', err);
        res.status(500).json({ error: 'Database getion failed' });
    }
}

//only img GETbyID CONTROLLER
const getEmailByID = async (req, res) => {

    const id = req.params.tbs_passenger_id
    try {
       const query = `
       SELECT 
       tbs_passenger_id,
                            email_id
       FROM passenger_profile WHERE tbs_passenger_id = $1 ;
       `;
       const result = await tbsWebPool.query(query, [id]);

       if (result.rowCount === 0) {
           return res.status(200).json({ message: 'passenger not found' });
       }
       
       res.status(200).send(result.rows);
        } catch (err) {
        console.error('Error executing query', err.stack);
        res.status(500).send('Server error')
        } 
   }

   //SEARCH EMAILID 
   const SearchEmail = async (req, res) => {
    const searchTerm = req.query.searchTerm;

    if (!searchTerm) {
        return res.status(400).json({ error: 'Search term is required' });
    }

    try {
        const query = `SELECT * FROM passenger_profile WHERE email_id LIKE $1`;
        const values = [`%${searchTerm}%`]; // Use parameterized query to avoid SQL injection
        const result = await tbsWebPool.query(query, values);
        res.json(result.rows);
    } catch (err) {
        console.error('Error executing query:', err);
        res.status(500).json({ error: 'Database query failed' });
    }
}

module.exports = { passengerPost, passengerPut, passengerDelete, passengerGetById, passengerGetAll, addpassengerDelete, addpassengerGetAll, addpassengerGetById, addpassengerPost, addpassengerPut, AllpassengerSGetById, passengerReferrelCodeGetById, getEmail, getEmailByID, SearchEmail }