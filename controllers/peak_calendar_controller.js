const xlsx = require('xlsx');
const { tbsWebPool } = require('../config/dbconfig');

const excelDateToJSDate = (serial) => {
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return date;
};

const importPeakCalendar = async (req, res) => {
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
            const { Date, Day, Description, Status, Peak_day } = row;

            const formattedDate = Date ? excelDateToJSDate(Date).toISOString().split('T')[0] : null;

            let Percentage = null;
            if (Peak_day.toLowerCase() === 'yes') {
                Percentage = 1;
            } else if (Peak_day.toLowerCase() === 'no') {
                Percentage = 2;
            }

            const query = `
                INSERT INTO public."Peak_Calendar_2025_2030" ("Date", "Day", "Description", "Status", "Peak_day", "Percentage")
                VALUES ($1, $2, $3, $4, $5, $6)
            `;

            await client.query(query, [
                formattedDate,
                Day,
                Description,
                Status,
                Peak_day,
                Percentage
            ]);
        }

        res.json({ message: 'Data imported successfully!' });
    } catch (error) {
        console.error('Error importing data:', error);
        res.status(500).json({ message: "Error importing data" });
    } finally {
        client.release();
    }
};

const updatePeakCalendarPercentage = async (req, res) => {
    const client = await tbsWebPool.connect();
    try {
        const { yes, no } = req.body;

        if (typeof yes === 'undefined' || typeof no === 'undefined') {
            return res.status(400).json({ message: "Both 'yes' and 'no' values are required" });
        }

        await client.query(`
            UPDATE public."Peak_Calendar_2025_2030"
            SET "Percentage" = $1
            WHERE LOWER("Peak_day") = 'yes'
        `, [yes]);

        await client.query(`
            UPDATE public."Peak_Calendar_2025_2030"
            SET "Percentage" = $1
            WHERE LOWER("Peak_day") = 'no'
        `, [no]);

        res.json({ message: 'Percentages updated successfully!' });
    } catch (error) {
        console.error('Error updating percentages:', error);
        res.status(500).json({ message: "Error updating percentages" });
    } finally {
        client.release();
    }
};


const peakDate = async (req, res) => {
    try {
        const { date } = req.params
        const Date = date.split('T')[0]
        const data = (await tbsWebPool.query('SELECT "Percentage" FROM public."Peak_Calendar_2025_2030" WHERE "Date" = $1', [Date])).rows
        res.status(200).json({ message: "Peak Date Percentage fetched Successfully", data })
    } catch (error) {
        console.error('Error updating percentages:', error);
        res.status(500).json({ message: "Error fetching percentages" });
    }
}

module.exports = {
    importPeakCalendar,
    updatePeakCalendarPercentage,
    peakDate
};
