const { tbsWebPool } = require('../config/dbconfig')
const path = require('path');

//POST API FOR TOP BUS ROUTES
const createTopBusRoutes = async (req, res, next) => {
    const { from_id, from, to_id, to, bus_count } = req.body;

    if(!from_id || !from || !to_id || !to ){
        console.log("missing required fields");
        res.status(404).json({message: 'missing required fields'})
    }

    const imageurl = req.file ? `/public/top_bus_rotes/${req.file.filename}` : null;
    
    if (!req.file) {
        console.log('File not uploaded or multer misconfiguration');
        return res.status(400).json({ error: 'No file uploaded or configuration issue' });
    }

    console.log(imageurl);

    try {
        const result = await tbsWebPool.query(
            `INSERT INTO public.top_bus_routes (from_id, "from", to_id, "to", image, bus_count)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [from_id, from, to_id, to, imageurl, bus_count]
        );
        res.status(201).json({ message: "Created successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
    next();
}

//GET API FOR TOP BUS ROUTES
const TopBuses = async (req, res) => {
    try {
      
        const result = await tbsWebPool.query(`SELECT * FROM public.top_bus_routes
        ORDER BY ID DESC`)

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No data found' });
        }

        res.json(result.rows)
    } catch (err) {
        console.error('Error fetching data', err);
        res.status(500).json({ message: 'Error fetching data' });
    }
}

//PUT API FOR TOP BUS ROUTES
const updateBusRoutes = async (req, res) => {
    const  id = req.params.id;
    const { from_id, from, to_id, to, bus_count } = req.body;
    if(!from_id || !from || !to_id || !to ){
        console.log("missing required fields");
        res.status(404).json({message: 'missing required fields'})
    }

    const imageurl = req.file ? `/public/top_bus_rotes/${req.file.filename}` : null;
    
    if (!req.file) {
        console.log('File not uploaded or multer misconfiguration');
        return res.status(400).json({ error: 'No file uploaded or configuration issue' });
    }
    try {
        const result = await tbsWebPool.query(
            `UPDATE public.top_bus_routes
             SET from_id = $1, "from" = $2, to_id = $3, "to" = $4, image = COALESCE($5, image), bus_count = $6
             WHERE id = $7 RETURNING *`,
            [from_id, from, to_id, to, imageurl, bus_count, id]
        )

        if (result.rows.length === 0) {
            res.status(404).json({ message: 'Bus route not found' });
        } else {
            res.status(200).json({ message: 'Bus route updated successfully' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}  

//DELETE API FOR TOP BUS ROUTES
const deleteRoutes = async (req, res) => {
    const  id = req.params.id;

    try {
        const result = await tbsWebPool.query(
            `DELETE FROM public.top_bus_routes WHERE id = $1 RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ message: 'Bus route not found' });
        } else {
            res.status(200).json({ message: 'Bus route deleted successfully' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { TopBuses, createTopBusRoutes, updateBusRoutes, deleteRoutes }