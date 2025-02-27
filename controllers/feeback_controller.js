const express = require('express');
const { tbsWebPool } = require('../config/dbconfig');
const nodemailer = require('nodemailer')

//GET ALL FEEDBACKS
const getFeedback = async (req, res) => {
    tbsWebPool.query('SELECT * FROM feedback_tbl ORDER BY created_at DESC', (err,result) => {
        if(!err){
            res.send(result.rows);
        } 
        tbsWebPool.end;
    })
};

//GET FEEDBACK BY ID
const getFeedbackById = async (req, res) => {
    try{
        const id = req.params.tbs_fb_id;
        const getFbId = `SELECT * FROM feedback_tbl WHERE tbs_fb_id = $1 ORDER BY created_at DESC`;
        const result = await tbsWebPool.query(getFbId,[id]);
        res.status(200).send(result.rows);
    } catch(err) {
        console.log(err.message);
        res.status(201).send("Error getting records");
    }
}

//POST FEEDBACK
const postFeedback = async (req, res) => {
    const {tbs_passenger_id, name, rating, description, email, phone, occupation, occupation_id} = req.body;
    console.log('Request Body:', req.body);

    try{
        const insertFb = `INSERT INTO feedback_tbl ( tbs_passenger_id, name, rating, description, email, phone, occupation, occupation_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
        const values = [tbs_passenger_id, name, rating, description, email, phone, occupation, occupation_id];

        const result = await tbsWebPool.query(insertFb, values); 
         res.send("Thanks for giving feedback!");
        } catch (err) {
            console.error(err);
            return res.status(201).send("Error inserting Feedback");
        }
}

//GET FEEDBACK BY RATING RANGE
const getFeedbackByRating = async (req, res) => {
    const {ratingFrom, ratingTo} = req.body
    try{
        const getFbReq = `SELECT * FROM feedback_tbl WHERE rating >= $1 AND rating <= $2 ORDER BY created_at DESC`;
        const result = await tbsWebPool.query(getFbReq,[ratingFrom, ratingTo]);
        res.status(200).json(result.rows);
    } catch(err) {
        console.log(err.message);
        res.status(201).json({ error:"Error getting records" });
    }
};

//DELETE FEEDBACK BY ID
const deleteFeedback = async (req, res) => {
    try{
        const id = req.params.tbs_fb_id;
        const DelFbId = `DELETE FROM feedback_tbl WHERE tbs_fb_id = $1`;
        const result = await tbsWebPool.query(DelFbId,[id]);
        if (result.rows.length === 0) {
            res.status(404).json({ message: 'feedback not found' });
        } else {
            res.status(200).json({message: 'Feedback deleted successfully'});
        }
    } catch(err) {
        console.log(err.message);
        res.status(201).send("Error deleting records");
    }
}

//ALL FEEDBACK COUNT AND FIND AVERAGE OF FEEDBACKS
const feedbackAverage = async (req, res) => {
    try {
      const query = `
        SELECT 
          COUNT(*) AS total_feedbacks, 
          AVG(rating) AS average_rating
        FROM feedback_tbl
        WHERE rating IS NOT NULL;`;
  
      const { rows } = await tbsWebPool.query(query);
  
      res.status(200).json({
        total_feedbacks: rows[0].total_feedbacks,
        average_rating: parseFloat(rows[0].average_rating).toFixed(2) || 0
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Server error' });
    }
  }


module.exports = { getFeedback, getFeedbackById, postFeedback, getFeedbackByRating, deleteFeedback, feedbackAverage }