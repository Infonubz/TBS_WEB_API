const xlsx = require('xlsx');
const { tbsWebPool } = require('../config/dbconfig')

const OperatorLogos = async (req, res) => {
    try {
      
        const result = await tbsWebPool.query(`SELECT * FROM public.operators_logo
        ORDER BY operator_id ASC `)

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No data found' });
        }

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching data', err);
        res.status(500).json({ message: 'Error fetching data' });
    }
}

//POST API FOR operator_name and logo
const createOperatorLogos = async (req, res, next) => {
    const { operator_ids, operator_names } = req.body;

    const ids = operator_ids.split(',');
    const names = operator_names.split(',');

    if (ids.length !== names.length || ids.length !== req.files.length) {
        return res.status(400).json({ message: 'Mismatch between operator data and uploaded files' });
    }

    try {
       
        const uploadPromises = ids.map((operator_id, index) => {
            const operator_name = names[index];
            const logourl = `/public/operator_logos/${req.files[index].filename}`;

            if (!operator_name || !operator_id) {
                throw new Error(`Missing required fields for operator at index ${index}`);
            }

            return tbsWebPool.query(
                `INSERT INTO public.operator_logos (operator_name, logos, operator_id)
                 VALUES ($1, $2, $3) RETURNING *`,
                [operator_name, logourl, operator_id]
            );
        });

        const results = await Promise.all(uploadPromises);

        res.status(201).json({ message: "Created successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
    next();
}

//PUT API FOR operator_name and logo
const updateOperatorLogos = async (req, res) => {

    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'Logos must be provided' });
    }

    const logoArray = req.files.map(file => `/public/operator_logos/${file.filename}`);
    console.log("Logo array:", logoArray);

    const additionalLogos = req.body.logos; 

    const additionalLogoArray = additionalLogos ? additionalLogos.split(',').map(logo => logo.trim()) : [];
    const combinedLogoArray = logoArray.concat(additionalLogoArray); 

    try {
       
        const updatePromises = combinedLogoArray.map((logo, index) => {
          
            const originalFilename = req.files[index].originalname; 
            const operatorId = originalFilename.split('-')[0].trim(); 
            const operatorIdInt = parseInt(operatorId); 

            if (isNaN(operatorIdInt)) {
                console.error(`Invalid operator_id extracted: ${operatorId}`);
                return Promise.reject(new Error(`Invalid operator_id extracted: ${operatorId}`));
            }

            return tbsWebPool.query(
                `UPDATE public.operators_logo
                 SET logos = $1
                 WHERE operator_id = $2`,
                [logo, operatorIdInt] 
            );
        });

        await Promise.all(updatePromises);

        res.status(200).json({ message: 'Logos updated successfully' });
    } catch (err) {
        console.error('Error updating logos', err);
        res.status(500).json({ error: 'Failed to update logos' });
    }
}

//DELETE API FOR operator_name and logo
const deleteOperatorLogos = async (req, res) => {
    const  auto_id = req.params.tbs_auto_id;

    try {
        const result = await tbsWebPool.query(
            `DELETE FROM public.operator_logos WHERE auto_id = $1 RETURNING *`,
            [auto_id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ message: 'operator_name and logo not found' });
        } else {
            res.status(200).json({ message: 'operator_name and logo deleted successfully' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

const importOperators = async (req, res) => {
    const client = await tbsWebPool.connect();
    try {
    
      if (!req.file) {
        return res.status(400).send('No files were uploaded.');
      }
  
      if (req.file.size > 5 * 1024 * 1024) {
        return res.status(400).send('File size exceeded (Max: 5MB)');
      }
  
      if (req.file.mimetype !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        return res.status(400).send('Only .xlsx files are allowed');
      }
  
      const workbook = xlsx.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(worksheet);
  
      console.log('Data from Excel:', jsonData[0]);
  
      for (const row of jsonData) {
        const { operator_id, operator_name } = row;
        
        const query = `
          INSERT INTO public.operators_logo (operator_id, operator_name)
          VALUES ($1, $2) `;
  
        await client.query(query, [
          operator_id,
          operator_name
        ]);
      }
  
      res.json({ message: 'Operators imported successfully!' });
    } catch (error) {
      console.error('Error importing data:', error);
      res.status(500).json({ message: "Error importing operators data" });
    } finally {
      client.release();
    }
  }

module.exports = { OperatorLogos, createOperatorLogos, updateOperatorLogos, deleteOperatorLogos, importOperators }