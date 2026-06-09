import axios from "axios";
import dotenv from "dotenv";
import express from 'express'
import cors from 'cors';
import process from 'process';
import mysql from 'mysql2/promise'

dotenv.config();

const app = express();
const port = 3001;
app.use(cors());

const db = await mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

await db.execute(`
    CREATE TABLE IF NOT EXISTS popular (
        id INT AUTO_INCREMENT PRIMARY KEY,
        trackID VARCHAR(255) UNIQUE,
        trackName VARCHAR(255),
        artist VARCHAR(255),
        trackPopularity INT,
        albumURL TEXT 
    )
`);

await db.execute(`
    CREATE TABLE IF NOT EXISTS emo (
        id INT AUTO_INCREMENT PRIMARY KEY,
        trackID VARCHAR(255) UNIQUE,
        trackName VARCHAR(255),
        artist VARCHAR(255),
        trackPopularity INT,
        albumURL TEXT 
    )
`);

const KEY = process.env.VITE_SPOTIFY_CLIENT_ID;
const SECRET = process.env.VITE_SPOTIFY_SECRET;

// communicate with the Spotify API to get an access token
const accessToken = async () => {
    const reponse = await axios({
        method: 'POST',
        url: 'https://accounts.spotify.com/api/token',
        headers: {
            Authorization: 'Basic ' + btoa(KEY + ':' + SECRET),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: 'grant_type=client_credentials'
    });

    return reponse.data.access_token;
}

const insertTrack = async (tracks, table = 'tracks') => {
    for (const track of tracks) {
        await db.execute(
            `INSERT IGNORE INTO ${table} (trackID, trackName, artist, trackPopularity, albumURL)
             VALUES (?, ?, ?, ?, ?)`,
            [track.trackID, track.trackName, track.artist, track.trackPopularity, track.albumURL]
        );
    }
};

const REMIX_KEYWORDS = [
    'remix', 'remixed', 'slowed', 'reverb', 'sped up', 'speed up',
    'nightcore', 'lofi', 'lo-fi', 'acoustic', 'cover', 'loopable',
    'instrumental', 'karaoke', 'edit', 'version', 'extended',
    'radio edit', 'tribute', 'white noise'
];

const isOriginal = (trackName) => {
    const lower = trackName.toLowerCase();
    return !REMIX_KEYWORDS.some(keyword => lower.includes(keyword));
}

const randomChar = () =>String.fromCharCode(97 + Math.floor(Math.random() * 26));

const POPULAR_QUERIES = () => [
    randomChar(),
    randomChar() + '%20' + randomChar(),
    randomChar() + '*',
    `year:2019-2026 ${randomChar()}`,
    `year:2010-2018 ${randomChar()}`,
    `year:2000-2009 ${randomChar()}`,
    `genre:pop ${randomChar()}`,
    `genre:rock ${randomChar()}`,
    `genre:hip-hop ${randomChar()}`,
    `genre:soul ${randomChar()}`,
    `genre:indie ${randomChar()}`,
    `genre:alternative-rock ${randomChar()}`,
    `genre:jazz-pop ${randomChar()}`,
    `genre:alternative-pop ${randomChar()}`,
    `genre:pop-rap ${randomChar()}`,
    `genre:indie-pop ${randomChar()}`,
    `genre:bedroom ${randomChar()}`,
];

const EMO_QUERIES = () => [
    `genre:emo ${randomChar()}`,
    `genre:post-hardcore ${randomChar()}`,
    `genre:pop-punk ${randomChar()}`,
    `genre:punk ${randomChar()}`,
    `genre:screamo ${randomChar()}`,
    `genre:alternative-rock ${randomChar()}`,
];

const populatePool = async (table = 'popular', minPop = 70, maxPop = 100, queries = POPULAR_QUERIES()) => {
    const token = await accessToken();   
    const allTracks = [];
    
    for (const query of queries) {
        const searchResponse = await fetch(`https://api.spotify.com/v1/search?q=${query}&type=track&limit=50`, {
            headers: {
                Authorization: 'Bearer ' + token
            }
        });
        
        const text = await searchResponse.text();
        try {
            const data = JSON.parse(text);
            const filtered = data.tracks.items
            .filter((track) => isOriginal(track.name))
            .filter(track => track.popularity >= minPop && track.popularity <= maxPop);

            const tracks = filtered.map((track) => ({
                trackID: track.id,
                trackName: track.name,
                artist: track.artists[0].name,
                trackPopularity: track.popularity,
                albumURL: track.album.images[0].url
            }));

            allTracks.push(...tracks);
        } catch (error) {
            console.error("Error parsing search response:", error, "Response text:", text);
        }
    }
    
    await insertTrack(allTracks, table);
}

const getRandomTracks = async (table = 'popular', minPop = 70, maxPop = 100) => {
    const MIN_POOL_SIZE = 100;
    const [[{ count }]] = await db.execute(
        `SELECT COUNT(*) AS count FROM ${table} WHERE trackPopularity BETWEEN ? AND ?`,
        [minPop, maxPop]
    );

    if (count < MIN_POOL_SIZE) {
        await populatePool(table, minPop, maxPop);
    }

    const [tracks] = await db.execute(
        `SELECT * FROM ${table} WHERE trackPopularity BETWEEN ? AND ? ORDER BY RAND() LIMIT 50`,
        [minPop, maxPop]
    );
    return tracks;
};

const initializePool = async () => {
    const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM popular');
    const [[{ count: emoCount }]] = await db.execute('SELECT COUNT(*) AS count FROM emo');

    if (count === 0) {
        await Promise.all([
            populatePool('popular', 70, 100, POPULAR_QUERIES()),
            populatePool('popular', 70, 100, POPULAR_QUERIES()),
            populatePool('popular', 70, 100, POPULAR_QUERIES()),
        ]);
    }

    if (emoCount === 0) {
        await Promise.all([
            populatePool('emo', 40, 69, EMO_QUERIES()),
            populatePool('emo', 40, 69, EMO_QUERIES()),
            populatePool('emo', 40, 69, EMO_QUERIES()),
        ]);
    }
};

app.get('/api/spotify', async (req, res) => {
    try {
        const tracks = await getRandomTracks('popular', 70, 100);
        res.json(tracks);
    } catch (err) {
        console.error('Error fetching tracks:', err);
        res.status(500).json({ error: 'Failed to fetch tracks' });
    }
});

app.get('/api/spotify/emo', async (req, res) => {
    try {
        const tracks = await getRandomTracks('emo', 40, 69);
        res.json(tracks);
    } catch (err) {
        console.error('Error fetching tracks:', err);
        res.status(500).json({ error: 'Failed to fetch emo tracks' });
    }
});

app.post('/api/spotify/populate', async (req, res) => {
    try {
        await populatePool('popular', 70, 100, POPULAR_QUERIES());
        const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM popular');
        res.json({ message: 'Popular pool updated', total: count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to populate' });
    }
});

app.post('/api/spotify/populate/emo', async (req, res) => {
    try {
        await populatePool('emo', 40, 69, EMO_QUERIES());
        const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM emo');
        res.json({ message: 'Emo pool updated', total: count });
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to populate emo pool' });
    }
});

app.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}`);
    await initializePool();
});