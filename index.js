const express = require("express");
const cors = require("cors");
const https = require('https');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require("./config/db.js"); // Import your database connection from db.js
const app = express();





// parse requests of content-type - application/json

app.use(express.json({ limit: '50mb' }));
// parse requests of content-type - application/x-www-form-urlencoded

app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Add Access Control Allow Origin headers
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});
app.use(cors({
    origin: '*'
}));

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });


app.use(express.static('public')); // Serve static files
// Your OpenAI API key and configuration



// Define routes


// Route to register a public user
app.post('/registerPublicUser', (req, res) => {
    const { full_name, email, phone, organization, is_journalist, city, postal_code, address, password } = req.body;
  
    const query = `
      INSERT INTO public_users (full_name, email, phone, organization, is_journalist, city, postal_code, address, password)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
  
    db.query(query, [full_name, email, phone, organization, is_journalist, city, postal_code, address, password], (error, results) => {
      if (error) {
        console.error(error);
        res.status(500).send('Error registering the user');
        return;
      }
      res.status(201).send({ message: 'User registered successfully', userId: results.insertId });
    });
  });
  

// Login route
// Login route
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    // You should hash and compare passwords securely in production
    const query = 'SELECT * FROM public_users WHERE email = ? LIMIT 1';

    db.query(query, [email], (err, results) => {
        if (err) {
            res.json({ success: false, message: "Error querying the database." });
            return;
        }
        if (results.length > 0) {
            const user = results[0];
            // Verify password (assuming plaintext for simplicity; use hashing in production)
            if (user.password === password) {
                // Remove password and other sensitive info from the user object
                const { password, ...userData } = user;
                res.json({ success: true, message: "Login successful.", userData });
            } else {
                res.json({ success: false, message: "Invalid login credentials." });
            }
        } else {
            // No user found
            res.json({ success: false, message: "Invalid login credentials." });
        }
    });
});

// Endpoint to fetch hashtags for dropdown
app.get('/hashtags', (req, res) => {
    db.query('SELECT * FROM hashtags', (err, results) => {
        if (err) res.status(500).send(err);
        res.json(results);
    });
});


// Endpoint to fetch platforms for dropdown
app.get('/platforms', (req, res) => {
    db.query('SELECT * FROM platforms', (err, results) => {
        if (err) res.status(500).send(err);
        res.json(results);
    });
});

// Endpoint to fetch phrases
app.get('/getPhrases', (req, res) => {
    db.query('SELECT * FROM phrases', (err, results) => {
        if (err) res.status(500).send(err);
        res.json(results);
    });
});

//Add phrases
// POST endpoint to insert a single phrase
app.post('/addPhrase', (req, res) => {
    const { phrase, attack_type } = req.body; // Expecting individual entries
    if (!phrase || !attack_type) {
      return res.status(400).send('Invalid input');
    }
  
    const sql = `INSERT INTO phrases (phrase, attack_type) VALUES (?, ?)`;
  
    connection.query(sql, [phrase, attack_type], (error, results) => {
      if (error) {
        return res.status(500).send('Error inserting phrase');
      }
      res.send(`Inserted phrase with id ${results.insertId}`);
    });
  });
  

// Register incident
app.post('/registerIncident', upload.array('files'), (req, res) => {
    // Assuming this is correctly determined or retrieved earlier in your application logic

    const {
        public_user_id ='1',
        abuser_handle = 'N/A',
        attack_type = 'N/A',
        description = 'No description provided',
        target_of_attack = 'N/A',
        journalist_name = 'Anonymous',
        media_house = 'Independent',
        entity_name = 'N/A',
        actions_taken = 'None reported',
        tags = 'general',
        url = 'url',
        platform = 'Other'
    } = req.body;

    const files = req.files.length > 0 ? req.files.map(file => file.path) : ['No files uploaded'];

    // Adjusted INSERT INTO statement to include `public_user_id`
    const insertIncidentSql = `
        INSERT INTO incidents (
            public_user_id, abuser_handle, attack_type, description, target_of_attack, journalist_name,
            media_house, entity_name, actions_taken, platform, tags, url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Added `public_user_id` at the beginning of the parameters array
    db.query(insertIncidentSql, [public_user_id, abuser_handle, attack_type, description, target_of_attack, journalist_name, media_house, entity_name, actions_taken, platform, tags, url], (error, results) => {
        if (error) {
            console.error('Error inserting into incidents:', error);
            res.status(500).send('Error registering the incident');
            return;
        }

        const incidentId = results.insertId;

        // If there are files, insert them
        if (files[0] !== 'No files uploaded') {
            const insertFilesSql = 'INSERT INTO incident_files (incident_id, file_path) VALUES ?';
            const filesValues = files.map(file => [incidentId, file]); // Adjusted to include `incident_id` and `file_path`
            db.query(insertFilesSql, [filesValues], (error) => {
                if (error) {
                    console.error('Error inserting files:', error);
                    // Optionally, you could delete the incident here to clean up.
                    res.status(500).send('Error registering files for the incident');
                    return;
                }
                // Respond successfully after all insert operations are done
                res.json({ success: true, message: 'Incident and files registered successfully, with some fields using default values.' });
            });
        } else {
            // No files to insert, respond successfully
            res.json({ success: true, message: 'Incident registered successfully, with some fields using default values. No files were uploaded.' });
        }
    });
});

//get incidents

app.get('/getIncidents', (req, res) => {
    const userId = req.query.userId; // Retrieve the user ID from query parameters

    if (!userId) {
        res.json({ success: false, message: "User ID is missing." });
        return;
    }

    const query = 'SELECT * FROM incidents WHERE public_user_id = ?';

    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error('Error querying the database:', err);
            res.json({ success: false, message: "Error querying the database." });
            return;
        }
        res.json({ success: true, data: results });
    });
});



// set port, listen for requests
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
    
});

