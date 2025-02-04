const { tbsWebPool } = require('../config/dbconfig')

const popularDomestics = async (req, res) => {
    try {
      
        const result = await tbsWebPool.query('SELECT * FROM public.popular_domestic_presence ')

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No data found' });
        }

        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching data', err);
        res.status(500).json({ message: 'Error fetching data' });
    }
}

//POST API FOR TOP BUS ROUTES
const createPopularDomestics = async (req, res, next) => {
    const { source_id, source} = req.body;

    if(!source_id || !source ){
        console.log("missing required fields");
        res.status(404).json({message: 'missing required fields'})
    }

    const imageurl = req.file ? `/public/popular_domestic_presence/${req.file.filename}` : null;
    
    // Check and log req.file
    if (!req.file) {
        console.log('File not uploaded or multer misconfiguration');
        return res.status(400).json({ error: 'No file uploaded or configuration issue' });
    }

    console.log(imageurl);

    try {
        const result = await tbsWebPool.query(
            `INSERT INTO public.popular_domestic_presence (source_id, "source_name", image)
             VALUES ($1, $2, $3) RETURNING *`,
            [source_id, source, imageurl]
        );
        res.status(201).json({ message: "Created successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
    next();
}

//PUT API FOR popular domestic presence
const updateDomestics = async (req, res) => {
    const  id = req.params.id;
    const { source_id, source } = req.body;
    if(!source_id || !source ){
        console.log("missing required fields");
        res.status(404).json({message: 'missing required fields'})
    }

    const imageurl = req.file ? `/public/popular_domestic_presence/${req.file.filename}` : null;
    
    // Check and log req.file
    if (!req.file) {
        console.log('File not uploaded or multer misconfiguration');
        return res.status(400).json({ error: 'No file uploaded or configuration issue' });
    }
    try {
        const result = await tbsWebPool.query(
            `UPDATE public.popular_domestic_presence
             SET source_id = $1, "source_name" = $2, image = COALESCE($3, image)
             WHERE id = $4 RETURNING *`,
            [source_id, source, imageurl, id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ message: 'popular domestic presence not found' });
        } else {
            res.status(200).json({ message: 'popular domestic presence updated successfully' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}  

//DELETE API FOR popular domestic presence
const deleteDomestics = async (req, res) => {
    const  id = req.params.id;

    try {
        const result = await tbsWebPool.query(
            `DELETE FROM public.popular_domestic_presence WHERE id = $1 RETURNING *`,
            [id]
        );

        if (result.rows.length === 0) {
            res.status(404).json({ message: 'popular domestic presence not found' });
        } else {
            res.status(200).json({ message: 'popular domestic presence deleted successfully' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { popularDomestics, createPopularDomestics, updateDomestics, deleteDomestics }