const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const app = express();
const PORT = 4000;
const multer = require("multer");
const path = require("path");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

// Create a MySQL connection
const db = mysql.createConnection({
  host: '127.0.0.1',
  user: 'root',
  password: 'root@123',
  database: 'userdashboard',
});


// Connect to the database
db.connect((err) => {
  if (err) {
    console.error("Error connecting to the database: " + err.message);
  } else {
    console.log("Connected to the database");
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Specify the directory where the files will be stored
  },
  filename: (req, file, cb) => {
    cb(null, `${req.query.username}_${Date.now()}_${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

const users = [];
let code;

const generateCode = () => Math.random().toString(36).substring(2, 8);

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  // Perform a SELECT query to check if the user's credentials are valid
  const sql = "SELECT * FROM users WHERE email = ? AND password = ?";
  const values = [email, password];
  db.query(sql, values, (err, results) => {
    if (err) {
      console.error("Error logging in: " + err.message);
      return res.json({ error_message: "Login failed" });
    }
    if (results.length !== 1) {
      return res.json({
        error_message: "Incorrect credentials",
      });
    }
    const username = results[0].username;
    const lastLoginTime = new Date(); // Get the current timestamp
    const updateLastLoginSql = "UPDATE users SET last_login = ? WHERE username = ?";
    const updateLastLoginValues = [lastLoginTime, username];
    db.query(updateLastLoginSql, updateLastLoginValues, (updateErr, updateResult) => {
      if (updateErr) {
        console.error("Error updating last login time: " + updateErr.message);
      }
    });

    const activitySql = "INSERT INTO activity_feed (username, activity_type, timestamp, content) VALUES (?, ?, ?, ?)";
    const activityValues = [username, 'login', lastLoginTime, 'User logged in'];
    db.query(activitySql, activityValues, (activityErr, activityResult) => {
      if (activityErr) {
        console.error("Error inserting activity feed entry: " + activityErr.message);
      }
    });
    code = generateCode();
    res.json({
      message: "Login successfully",
      data: {
        username: results[0].username,
      },
    });
  });
});

app.post("/api/register", (req, res) => {
	const { email, password, tel, username } = req.body;
	const sql = "INSERT INTO users (email, password, tel, username) VALUES (?, ?, ?, ?)";
	const values = [email, password, tel, username];
	db.query(sql, values, (err, result) => {
	  if (err) {
	    console.error("Error registering user: " + err.message);
	    return res.json({ error_message: "User registration failed" });
	  }
	  res.json({ message: "Account created successfully!" });
	});
});

app.post("/api/verification", (req, res) => {
	if (req.body.code === code) {
		return res.json({ message: "You're verified successfully" });
	}
	res.json({
		error_message: `Please type this code as an otp since we are not sending any otp: ${code}`,
	});
});

app.get("/api/profile", (req, res) => {
  const username = req.query.username;
  // Perform a SELECT query to retrieve the user's profile data by username
  const sql = "SELECT username, email, bio, tel, profile_photo FROM users WHERE username = ?";
  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error("Error fetching profile data: " + err.message);
      return res.status(500).json({ error_message: "Profile data retrieval failed" });
    }
    if (results.length === 1) {
      const profileData = results[0];
      const profilePhoto = profileData.profile_photo ? Buffer.from(profileData.profile_photo).toString('base64') : null;
      res.json({ profile: { ...profileData, profile_photo: profilePhoto } });
    } else {
      res.status(404).json({ error_message: "User not found" });
    }
  });
});

app.put("/api/profile", upload.single("profilePicture"), (req, res) => {
  const username = req.query.username;
  const { email, bio, tel } = req.body;
  const profilePicture = req.file ? req.file.filename : null;

  // Check if the 'email' field is provided
  if (!email) {
    return res.status(400).json({ error_message: "Email is required" });
  }

  // Perform an UPDATE query to update the user's profile data
  let sql;
  let values;

  if (profilePicture) {
    // Update profile picture
    sql = "UPDATE users SET email = ?, bio = ?, tel = ?, profile_photo = ? WHERE username = ?";
    values = [email, bio, tel, profilePicture, username];
  } else {
    // Do not update profile picture
    sql = "UPDATE users SET email = ?, bio = ?, tel = ? WHERE username = ?";
    values = [email, bio, tel, username];
  }

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error("Error updating profile data: " + err.message);
      return res.status(500).json({ error_message: "Profile data update failed" });
    }
    res.json({ message: "Profile data updated successfully" });
  });
});

app.get("/api/lastlogin", (req, res) => {
  const username = req.query.username;
  const getLastLoginTimeSql = "SELECT last_login FROM users WHERE username = ?";

  db.query(getLastLoginTimeSql, [username], (err, lastLoginResult) => {
    if (err) {
      console.error("Error fetching last login time: " + err.message);
      return res.status(500).json({ error_message: "Failed to retrieve last login time" });
    }

    if (lastLoginResult.length === 1) {
      const lastLoginTime = lastLoginResult[0].last_login;
      res.json({ lastLoginTime: lastLoginTime });
    } else {
      res.status(404).json({ error_message: "User not found" });
    }
  });
});

app.get("/api/activityfeed", (req, res) => {
  const username = req.query.username;
  const getActivityFeedSql = "SELECT activity_type, timestamp, content FROM activity_feed WHERE username = ? ORDER BY timestamp";

  db.query(getActivityFeedSql, [username], (activityErr, activityFeedData) => {
    if (activityErr) {
      console.error("Error fetching activity feed: " + activityErr.message);
      return res.status(500).json({ error_message: "Failed to retrieve activity feed" });
    }

    res.json({ activityFeed: activityFeedData });
  });
});


app.get("/api/friendslist", (req, res) => {
  const username = req.query.username;
  const getFriendsSql = "SELECT friend_name FROM friends WHERE username = ?";

  db.query(getFriendsSql, [username], (friendsErr, friendsListData) => {
    if (friendsErr) {
      console.error("Error fetching friends list: " + friendsErr.message);
      return res.status(500).json({ error_message: "Failed to retrieve friends list" });
    }

    res.json({ friendsList: friendsListData });
  });
});

app.post("/api/addfriend", (req, res) => {
  const username = req.query.username;
  const { newFriendName } = req.body;

  const insertFriendSql = "INSERT INTO friends (username, friend_name) VALUES (?, ?)";
  const values = [username, newFriendName];

  db.query(insertFriendSql, values, (err, result) => {
    if (err) {
      console.error("Error adding friend: " + err.message);
      return res.status(500).json({ error_message: "Failed to add friend" });
    }

    res.json({ message: "Friend added successfully!" });
  });
});

// Close the MySQL connection when the server is stopped
process.on("exit", () => db.end());
process.on("SIGINT", () => db.end());
process.on("uncaughtException", () => db.end());

app.listen(PORT, () => {
	console.log(`Server listening on ${PORT}`);
});
