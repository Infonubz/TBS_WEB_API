const { tbsWebPool, abhiBusPool } = require('../config/dbconfig')

// FETCH ALL BUS SEAT INFORMATION
const getSeatLayout = async (req, res) => {
    try {
      const busInfoQuery = 'SELECT "bus_id", "layout", "seats_id_layout" FROM "tbs_bus_info";'; 
      const busInfoResult = await tbsWebPool.query(busInfoQuery);
      
      if (busInfoResult.rows.length === 0) {
        return res.status(200).json({
          status: 'success',
          data: [],
        });
      }
      
      return res.status(200).json({
        status: 'success',
        data: busInfoResult.rows,
      });
    } catch (error) {
      console.error('Error fetching bus info:', error.message || error);
      res.status(500).json({
        status: 'error',
        message: 'Error fetching bus info',
        error: error.message || error,
      });
    }
  }

// FETCH BUS SEAT INFORMATION BY ID
const getSeatLayoutById = async (req, res) => {
    try {
      const { bus_id } = req.body;
      
      if (!bus_id) {
        return res.status(400).json({
          status: 'error',
          message: 'Bus ID is required',
        });
      }
  
      const busInfoQuery = `
        SELECT "bus_id", "layout", "seats_id_layout" 
        FROM "tbs_bus_info" 
        WHERE "bus_id" = $1`;
      
      const busInfoResult = await tbsWebPool.query(busInfoQuery, [bus_id]);
  
      if (busInfoResult.rows.length === 0) {
        return res.status(404).json({
          status: 'success',
          data: [],
          message: 'No bus found for the provided Bus ID',
        });
      }
  
      return res.status(200).json({
        status: 'success',
        data: busInfoResult.rows,
      });
    } catch (error) {
      console.error('Error fetching bus info by ID:', error.message || error)
      res.status(500).json({
        status: 'error',
        message: 'Error fetching bus info by ID',
        error: error.message || error,
      })
    }
}

//PUT API FOR SEAT STATUS
const updateSeatStatus = async (req, res) => {
    const { bus_id, id, status } = req.body

    const clientTbs = await tbsWebPool.connect()
    const clientabhi = await abhiBusPool.connect()

    try {
        await clientTbs.query('BEGIN')
        await clientabhi.query('BEGIN')

        if (id.length !== status.length) {
            return res.status(400).json({ error: 'The id and status arrays must have the same length' })
        }

        for (let i = 0; i < id.length; i++) {
            const updateResult = await clientTbs.query(
                `UPDATE tbs_bus_info
                 SET seats_id_layout = (
                     SELECT jsonb_agg(
                                CASE
                                    WHEN seat->>'id' = $2 THEN seat || jsonb_build_object('status', $3::text)
                                    ELSE seat
                                END
                            )
                     FROM jsonb_array_elements(seats_id_layout) AS seat
                 ) WHERE bus_id = $1 RETURNING seats_id_layout;`, [bus_id, id[i], status[i]] )

            if (updateResult.rowCount === 0) {
                throw new Error(`Seat ${id[i]} not found in tbs_bus_info`)
            }
        }

        for (let i = 0; i < id.length; i++) {
            const updateAbhiResult = await clientabhi.query(
                `UPDATE live_data_details
                 SET seats_id_layout = (
                     SELECT jsonb_agg(
                                CASE
                                    WHEN seat->>'id' = $2 THEN seat || jsonb_build_object('status', $3::text)
                                    ELSE seat
                                END
                            )
                     FROM jsonb_array_elements(seats_id_layout) AS seat
                 ) WHERE "Bus_id" = $1 RETURNING seats_id_layout;`, [bus_id, id[i], status[i]])

            if (updateAbhiResult.rowCount === 0) {
                throw new Error(`Seat ${id[i]} not found in abhiBusPool live_data_details`)
            }
        }

        await clientTbs.query('COMMIT')
        await clientabhi.query('COMMIT')

        res.status(200).json({ message: 'Seat statuses updated successfully' })
    } catch (error) {
        await clientTbs.query('ROLLBACK')
        await clientabhi.query('ROLLBACK')

        console.error(error)
        res.status(500).json({ error: 'Database server error' })
    } finally {
        clientTbs.release()
        clientabhi.release()
    }
}

module.exports = { getSeatLayout, getSeatLayoutById, updateSeatStatus }