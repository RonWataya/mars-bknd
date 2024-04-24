const express = require("express");
const cors = require("cors");
const https = require('https');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require("./config/db.js"); // Import your database connection from db.js
const app = express();





// parse requests of content-type - application/json
// Configure CORS
app.use(cors({
    origin: '*', // Allows all domains
    optionsSuccessStatus: 200,
    credentials: true, // Allows cookies to be sent from the client
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// Other middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// Endpoint to get attack types
app.get('/attackTypes', (req, res) => {
    const sql = 'SELECT * FROM attack_types';
    db.query(sql, (error, results) => {
        if (error) {
            res.status(500).send('Error fetching attack types');
            return;
        }
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
// Register incident
app.post('/registerIncident', upload.array('files'), (req, res) => {
    // Extract parameters from request body with defaults
    const {
        public_user_id = '1',
        abuser_handle = 'N/A',
        attack_type_id, // Now expecting an attack type ID instead of a description string
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

    // Insert the incident into the database
    const insertIncidentSql = `
        INSERT INTO incidents (
            public_user_id, abuser_handle, attack_type_id, description, target_of_attack, journalist_name,
            media_house, entity_name, actions_taken, platform, tags, url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // Execute the insertion
    db.query(insertIncidentSql, [public_user_id, abuser_handle, attack_type_id, description, target_of_attack, journalist_name, media_house, entity_name, actions_taken, platform, tags, url], (error, results) => {
        if (error) {
            console.error('Error inserting into incidents:', error);
            res.status(500).send('Error registering the incident');
            return;
        }

        const incidentId = results.insertId;
        // Call updateHarassmentCounts right after inserting the incident
        updateHarassmentCounts();
        // Update attack type details
        const updateAttackTypeSql = 'UPDATE attack_type_details SET count = count + 1, harassment_attack_types = harassment_attack_types + 1 WHERE attack_type_id = ?';
        db.query(updateAttackTypeSql, [attack_type_id], (updateError) => {
            if (updateError) {
                console.error('Error updating attack type count:', updateError);
                // Optionally, handle rollback or other cleanup
                res.status(500).send('Error updating attack type details');
                return;
            }

            // If there are files, insert them
            if (files[0] !== 'No files uploaded') {
                const insertFilesSql = 'INSERT INTO incident_files (incident_id, file_path) VALUES ?';
                const filesValues = files.map(file => [incidentId, file]);
                db.query(insertFilesSql, [filesValues], (filesError) => {
                    if (filesError) {
                        console.error('Error inserting files:', filesError);
                        res.status(500).send('Error registering files for the incident');
                        return;
                    }
                    res.json({ success: true, message: 'Incident and files registered successfully.' });
                });
            } else {
                res.json({ success: true, message: 'Incident registered successfully. No files were uploaded.' });
            }
        });
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

//Get home page social and attack types count
// Endpoint to fetch social media data

app.get('/social-media-attacks', (req, res) => {
  const query = 'SELECT * FROM social_media';
  db.query(query, (error, results) => {
    if (error) throw error;
    res.json(results);
  });
});

//Scheduled task to count harrasments
// Function to update harassment counts
function updateHarassmentCounts() {
  const sql = `
    UPDATE social_media sm
    JOIN (
      SELECT platform, COUNT(*) as cnt
      FROM incidents
      GROUP BY platform
    ) i ON sm.name = i.platform
    SET sm.harassment_count = i.cnt;
  `;

  db.query(sql, (error, results, fields) => {
    if (error) {
      return console.error(error.message);
    }
    console.log('Harassment counts updated:', results.affectedRows);
  });
}

// Endpoint to get attack types details
app.get('/attack-type-count', (req, res) => {
    const query = 'SELECT * FROM attack_type_details';
    db.query(query, (error, results) => {
      if (error) throw error;
      res.json(results);
    });
});


/*Schedule task to run every day at midnight (00:00)
cron.schedule('0 0 * * *', () => {
  console.log('Running a daily task to update harassment counts');
  updateHarassmentCounts();
});*/

//Admin section
// Endpoint to register a public user as a panda user
app.post('/applyPandaUser', (req, res) => {
    const { public_user_id, full_name, email, phone, organization, social_handle, prefered_contact } = req.body;

    const sql = 'INSERT INTO panda_users (public_user_id, full_name, email, phone, organization, social_handle, prefered_contact, status) VALUES (?, ?, ?, ?, ?, ?, ?, "pending")';
    db.query(sql, [public_user_id, full_name, email, phone, organization, social_handle, prefered_contact], (err, result) => {
        if (err) {
            console.error('Error applying as panda user:', err);
            res.status(500).send('Failed to apply as panda user');
            return;
        }
        res.status(201).send('Application submitted successfully, status is pending.');
    });
});

// Endpoint for admin to update the status of a panda user
app.post('/updatePandaUserStatus', (req, res) => {
    const { id, status } = req.body; // status should be 'accepted' or 'declined'

    if (!['accepted', 'declined'].includes(status)) {
        res.status(400).send('Invalid status provided');
        return;
    }

    const sql = 'UPDATE panda_users SET status = ? WHERE id = ?';
    db.query(sql, [status, id], (err, result) => {
        if (err) {
            console.error('Error updating panda user status:', err);
            res.status(500).send('Failed to update status');
            return;
        }
        if (result.affectedRows === 0) {
            res.status(404).send('Panda user not found');
            return;
        }
        res.send('Status updated successfully');
    });
});

app.get('/pandaUsers', (req, res) => {
    const sql = 'SELECT * FROM panda_users';
    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error fetching panda users:', err);
            res.status(500).send('Error fetching panda users');
            return;
        }
        res.json(results);
    });
});

// Endpoint to get a single panda user by id
app.get('/pandaUser/:id', (req, res) => {
    const { id } = req.params;
    const sql = 'SELECT * FROM panda_users WHERE id = ?';
    db.query(sql, [id], (err, results) => {
        if (err) {
            console.error('Error fetching panda user:', err);
            res.status(500).send('Error fetching panda user');
            return;
        }
        if (results.length === 0) {
            res.status(404).send('Panda user not found');
            return;
        }
        res.json(results[0]); // Send only the first result as ID should be unique
    });
});

//update social handle
app.patch('/pandaUser/:id/socialHandle', (req, res) => {
    const { id } = req.params;
    const { socialHandle } = req.body;

    if (!socialHandle) {
        res.status(400).send('Social handle is required');
        return;
    }

    const sql = 'UPDATE panda_users SET social_handle = ? WHERE id = ?';
    db.query(sql, [socialHandle, id], (err, result) => {
        if (err) {
            console.error('Error updating social handle:', err);
            res.status(500).send('Error updating social handle');
            return;
        }
        if (result.affectedRows === 0) {
            res.status(404).send('Panda user not found');
            return;
        }
        res.send({ success: true, message: 'Social handle updated successfully' });
    });
});

//register admin
app.post('/registerAdmin', (req, res) => {
    const { name, surname, email, phone } = req.body;
    if (!name || !surname || !email || !phone) {
        res.status(400).send('All fields are required');
        return;
    }

    const query = 'INSERT INTO admin_users (name, surname, email, phone) VALUES (?, ?, ?, ?)';
    db.query(query, [name, surname, email, phone], (err, result) => {
        if (err) {
            console.error('Error registering admin user:', err);
            res.status(500).send('Error registering admin user');
            return;
        }
        res.send({ success: true, message: 'Admin registered successfully', adminId: result.insertId });
    });
});

//login
// Endpoint to log in an admin user
app.post('/loginAdmin', (req, res) => {
    const { email, password } = req.body;

    // In a real implementation, you would hash the incoming password and compare it to the stored hash
    const query = 'SELECT * FROM admin_users WHERE email = ?';
    db.query(query, [email], (err, results) => {
        if (err) {
            console.error('Error logging in:', err);
            res.status(500).send('Error logging in');
            return;
        }
        if (results.length === 0) {
            res.status(404).send('User not found');
            return;
        }
        // Simulated password check (do not use in production)
        if (password === 'theActualPassword') {
            res.send({ success: true, message: 'Login successful', admin: results[0] });
        } else {
            res.status(401).send('Incorrect password');
        }
    });
});
// set port, listen for requests
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
    
});

