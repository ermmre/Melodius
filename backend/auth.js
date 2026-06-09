import axios from "axios";
import dotenv from "dotenv";
import express from 'express'
import cors from 'cors';
import process from 'process';
import Database from "better-sqlite3";

dotenv.config();

const app = express();
const port = 3001;
app.use(cors());

const db = new Database('tracks.db');

db.exec(`
CREATE TABLE IF NOT EXISTS popular (
    id INTEGER PRIMARY KEY,
    trackID TEXT UNIQUE,
    trackName TEXT,
    artist TEXT,
    trackPopularity INTEGER,
    albumURL TEXT);

CREATE TABLE IF NOT EXISTS emo (
    id INTEGER PRIMARY KEY,
    trackID TEXT UNIQUE,
    trackName TEXT,
    artist TEXT,
    trackPopularity INTEGER,
    albumURL TEXT);
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

const insertTrack = (tracks) => {
    const insert = db.prepare(`
        INSERT OR IGNORE INTO popular (trackID, trackName, artist, trackPopularity, albumURL)
        VALUES (@trackID, @trackName, @artist, @trackPopularity, @albumURL)
    `);
    const insertMany = db.transaction((tracks) => {
        for (const track of tracks) insert.run(track);
    });

    insertMany(tracks);
}

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

const populatePool = async () => {
    const token = await accessToken();   
    const queries = [
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
            .filter(track => track.popularity >= 70);

            console.log(`Query "${query}" → ${data.tracks.items.length} total, ${filtered.length} passed filter`);

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
    
    insertTrack(allTracks);
}

const populateEmoPool = async () => {
    const token = await accessToken();

    const queries = [
        `genre:emo ${randomChar()}`,
        `genre:post-hardcore ${randomChar()}`,
        `genre:pop-punk ${randomChar()}`,
        `genre:punk ${randomChar()}`,
        `genre:screamo ${randomChar()}`,
        `genre:alternative-rock ${randomChar()}`,
    ];

    const allTracks = [];

    for (const query of queries) {
        const res = await fetch(
            `https://api.spotify.com/v1/search?q=${query}&type=track&limit=50`,
            { headers: { Authorization: 'Bearer ' + token } }
        );
        const text = await res.text();
        try {
            const data = JSON.parse(text);
            const filtered = data.tracks.items
                .filter(track => isOriginal(track.name))
                .filter(track => track.popularity >= 40 && track.popularity <= 69);

            console.log(`Query "${query}" → ${data.tracks.items.length} total, ${filtered.length} passed filter`);

            const tracks = filtered.map(track => ({
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

    const insert = db.prepare(`
        INSERT OR IGNORE INTO emo (trackID, trackName, artist, trackPopularity, albumURL)
        VALUES (@trackID, @trackName, @artist, @trackPopularity, @albumURL)
    `);
    const insertMany = db.transaction(tracks => {
        for (const track of tracks) insert.run(track);
    });
    insertMany(allTracks);
};

const getRandomTracks = async (count = 2) => {
    const MIN_POOL_SIZE = 100;
    const poolSize = db.prepare('SELECT COUNT(*) AS count FROM popular').get().count;

    if (poolSize < MIN_POOL_SIZE) {
        await populatePool();
    }

    return db.prepare('SELECT * FROM popular ORDER BY RANDOM() LIMIT ?').all(count);
}

const initializePool = async () => {
    const count = db.prepare('SELECT COUNT(*) AS count FROM popular').get().count;
    if (count == 0) {
        await Promise.all(
            [populatePool(), populatePool(), populatePool(), 
            populatePool(), populatePool()]
        );
    }
}

app.get('/api/spotify', async (req, res) => {
    try {
        const tracks = await getRandomTracks(2);
        res.json(tracks);
    } catch (err) {
        console.error('Error fetching tracks:', err);
        res.status(500).json({ error: 'Failed to fetch tracks' });
    }
});

app.post('/api/spotify/populate', async (req, res) => {
    try {
        await populatePool();
        res.json({ message: 'Pool updated', total: db.prepare('SELECT COUNT(*) AS count FROM popular').get().count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to populate' });
    }
});

app.post('/api/spotify/populate/emo', async (req, res) => {
    try {
        await populateEmoPool();
        res.json({ message: 'Emo pool updated', total: db.prepare('SELECT COUNT(*) AS count FROM emo').get().count });
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to populate emo pool' });
    }
});

app.get('/api/spotify/emo', async (req, res) => {
    try {
        const tracks = db.prepare('SELECT * FROM emo ORDER BY RANDOM() LIMIT 50').all();
        res.json(tracks);
    } catch (err) {
        console.error('Error fetching tracks:', err);
        res.status(500).json({ error: 'Failed to fetch emo tracks' });
    }
});

app.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}`);
    await initializePool();
});