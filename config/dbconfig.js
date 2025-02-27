require('dotenv').config();
const { Pool } = require('pg');

const createPool = (database) => {
  return new Pool({
    host: process.env.HOST,
    port: process.env.PORT,
    user: process.env.USER,
    password: process.env.PASSWORD,
    database,
  });
};

const abhiBusPool = createPool(process.env.DATABASE2);
const tbsCrmPool = createPool(process.env.DATABASE1);
const tbsWebPool = createPool(process.env.DATABASE0);

module.exports = {
  abhiBusPool,
  tbsCrmPool, tbsWebPool 
};  
