import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import process from "process";
import mysql from "mysql2/promise";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

app.use(limiter);
app.use(cors({
    origin: ['https://ermmre.github.io', 'http://localhost:5173']
}));

// =========================
// DATABASE CONFIGURATIONS
// =========================

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

await db.execute(
    `
    CREATE TABLE IF NOT EXISTS 2000s (
        id INT AUTO_INCREMENT PRIMARY KEY,
        trackID VARCHAR(255) UNIQUE,
        trackName VARCHAR(255),
        artist VARCHAR(255),
        trackPopularity INT,
        albumURL TEXT 
    )
`);

await db.execute(
    `
    CREATE TABLE IF NOT EXISTS latin (
        id INT AUTO_INCREMENT PRIMARY KEY,
        trackID VARCHAR(255) UNIQUE,
        trackName VARCHAR(255),
        artist VARCHAR(255),
        trackPopularity INT,
        albumURL TEXT 
    )
`);

const insertTrack = async (tracks, table = 'tracks') => {
    for (const track of tracks) {
        await db.execute(
            `INSERT IGNORE INTO ${table} 
                (trackID, trackName, artist, trackPopularity, albumURL)
             VALUES (?, ?, ?, ?, ?)`,
            [track.trackID,
                track.trackName, 
                track.artist, 
                track.trackPopularity, 
                track.albumURL]
        );
    }
};

// =========================
// API CONFIGURATIONS
// =========================

const KEY = process.env.VITE_SPOTIFY_CLIENT_ID;
const SECRET = process.env.VITE_SPOTIFY_SECRET;

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
};

// =========================
// FILTERING LOGIC
// =========================

const REMIX_KEYWORDS = [
    'remix', 'remixed', 'slowed', 'reverb', 'sped up', 'speed up',
    'nightcore', 'lofi', 'lo-fi', 'acoustic', 'cover', 'loopable',
    'instrumental', 'karaoke', 'edit', 'version', 'extended',
    'radio edit', 'tribute', 'white noise'
];

const isOriginal = (trackName) => {
    const lower = trackName.toLowerCase();
    return !REMIX_KEYWORDS.some(keyword => lower.includes(keyword));
};

// =========================
// ADJACENCY LIST
// =========================

let adjacencyList = {};
let trackLookup = {};

const buildAdjacencyList = async (table = 'popular') => {
    const [tracks] = await db.execute(`SELECT * FROM ${table}`);
    const sorted = tracks.sort((a, b) => a.trackPopularity - b.trackPopularity);

    trackLookup[table] = {};
    for (const track of sorted) {
        trackLookup[table][track.trackID] = track;
    }

    adjacencyList[table] = {};
    for (let i = 0; i < sorted.length; i++) {
        adjacencyList[table][sorted[i].trackID] = [];
        for (let j = i + 1; j < sorted.length; j++) {
            const diff = sorted[j].trackPopularity - sorted[i].trackPopularity;
            if (diff > 4) break;
            if (diff >= 1) {
                adjacencyList[table][sorted[i].trackID]
                .push(sorted[j].trackID);
            }
        }
    }
};

// =========================
// PAIRING LOGIC
// =========================

const getClosePair = (table = 'popular') => {
    const map = adjacencyList[table];
    const lookup = trackLookup[table];

    const keys = Object.keys(map).filter(id => 
        map[id].length > 0 && 
        map[id].some(neighbourId => 
            lookup[neighbourId].trackPopularity !== lookup[id].trackPopularity)
    );

    if (keys.length === 0) return null;

    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const neighbors = map[randomKey];

    const randomNeighbour = neighbors[Math.floor(Math.random() * neighbors.length)];

    const pair = [lookup[randomKey], lookup[randomNeighbour]];
    return Math.random() > 0.5 ? pair : [pair[1], pair[0]];
};

// =========================
// POPULATING LOGIC
// =========================

const randomChar = () => String.fromCharCode(97 + Math.floor(Math.random() * 26));

const POPULAR_QUERIES = () => [
    // random characters
    randomChar(),
    randomChar() + '%20' + randomChar(),
    randomChar() + '*',
    // years with random characters
    `year:2019-2026 ${randomChar()}`,
    `year:2010-2018 ${randomChar()}`,
    `year:2000-2009 ${randomChar()}`,
    // genres with random characters
    `genre:pop ${randomChar()}`,
    `genre:rock ${randomChar()}`,
    `genre:hip-hop ${randomChar()}`,
    `genre:soul ${randomChar()}`,
    `genre:indie ${randomChar()}`,
    `genre:indie-pop ${randomChar()}`,
    `genre:alternative-rock ${randomChar()}`,
    `genre:jazz-pop ${randomChar()}`,
    `genre:alternative-pop ${randomChar()}`,
    `genre:bedroom ${randomChar()}`,
];

const populatePool = async (table, minPop, maxPop, queries) => {
    const token = await accessToken();   
    const allTracks = [];
    
    for (const query of queries) {
        const searchResponse = await fetch(
            `https://api.spotify.com/v1/search?q=${query}&type=track&limit=50`, {
            headers: {
                Authorization: 'Bearer ' + token
            }
        });
        
        const text = await searchResponse.text();
        try {
            const data = JSON.parse(text);
            const filtered = data.tracks.items
            .filter((track) => isOriginal(track.name))
            .filter(track => track.popularity >= minPop && 
                track.popularity <= maxPop);

            const tracks = filtered.map((track) => ({
                trackID: track.id,
                trackName: track.name,
                artist: track.artists[0].name,
                trackPopularity: track.popularity,
                albumURL: track.album.images[0].url
            }));

            allTracks.push(...tracks);
        } catch (error) {
            console.error("Error parsing search response:", error);
        }
    }
    
    await insertTrack(allTracks, table);
    await buildAdjacencyList(table);
};

const initializePool = async () => {
    const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM popular');

    if (count === 0) {
        await Promise.all([
            populatePool('popular', 70, 100, POPULAR_QUERIES()),
            populatePool('popular', 70, 100, POPULAR_QUERIES()),
            populatePool('popular', 70, 100, POPULAR_QUERIES()),
        ]);
    }

    await buildAdjacencyList('popular');
    await buildAdjacencyList('emo');
    await buildAdjacencyList('2000s');
    await buildAdjacencyList('latin');
};

const populateFromPlaylist = async (playlistID, table, minPop, maxPop) => {
    const token = await accessToken();
    const allTracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistID}/items?limit=50`;

    while (url) {
        const res = await fetch(url, {
            headers: { Authorization: 'Bearer ' + token }
        });

        const text = await res.text();
        try {
            const data = JSON.parse(text);
            const filtered = data.items
                .filter((track) => track.item && 
                track.item.type === 'track' && 
                isOriginal(track.item.name))
                .filter((track) => track.item.popularity >= minPop && 
                track.item.popularity <= maxPop)

            const tracks = filtered.map((track) => ({
                    trackID: track.item.id,
                    trackName: track.item.name,
                    artist: track.item.artists[0].name,
                    trackPopularity: track.item.popularity,
                    albumURL: track.item.album.images[0].url
                }));

            allTracks.push(...tracks);
            url = data.next;
        } catch (error) {
            console.error('Failed to populate using playlist', error);
            url = null;
        }
    }

    await insertTrack(allTracks, table);
    await buildAdjacencyList(table);

    console.log(`Added ${allTracks.length} tracks from playlist to ${table}`);
};

// =========================
// ROUTING & SERVER START
// =========================

app.get('/api/:tableName', async (req, res) => {
    const { tableName } = req.params;
    const validTables = ['popular', 'emo', '2000s', 'latin'];
    if (!validTables.includes(tableName)) {
        return res.status(400).json({ error: 'Invalid table requested'});
    }

    try {
        const tracks = getClosePair(tableName);
        if (!tracks) {
            return res.status(500).json({ error: 'No pairs available'});
        }
        res.json(tracks);
    } catch (error) {
        console.error('Error fetching tracks:', error);
        res.status(500).json({ error: 'Failed to fetch tracks'});
    }
});

app.post('/api/populate', async (req, res) => {
    if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        await populatePool('popular', 70, 100, POPULAR_QUERIES());
        await buildAdjacencyList('popular');
        const [[{ count }]] = await db.execute(
            'SELECT COUNT(*) AS count FROM popular');
        res.json({ message: 'Popular pool updated', total: count });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to populate' });
    }
});

app.post('/api/populate/playlist', async (req, res) => {
    if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { playlistID, table, minPop, maxPop } = req.body;
    if (!playlistID || !table) {
        return res.status(400).json({ error: 'playlistID and table are required' });
    }
    
    try {
        await populateFromPlaylist(playlistID, table, minPop || 40, maxPop || 100);
        res.json({ message: 'Playlist populating done' });
    } catch (err) {
        console.log(err)
        res.status(500).json({ error: 'Failed to populate from playlists' });
    }
});

app.listen(port, async () => {
    console.log(`Server running`);
    await initializePool();
});