import axios from "axios";
import dotenv from "dotenv";
import express from 'express'
import cors from 'cors';
import process from 'process';
import mysql from 'mysql2/promise'
import rateLimit from 'express-rate-limit';

dotenv.config();

const app = express();
const port = 3001;
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});

app.use(limiter);
app.use(cors({
    origin: ['https://ermmre.github.io', 'http://localhost:5173']
}))

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

let adjacencyMap = {};
let trackLookup = {};

const buildAdjacencyMap = async (table = 'popular') => {
    const [tracks] = await db.execute(`SELECT * FROM ${table}`);
    const sorted = tracks.sort((a, b) => a.trackPopularity - b.trackPopularity);

    trackLookup[table] = {};
    for (const track of sorted) {
        trackLookup[table][track.trackID] = track;
    }

    adjacencyMap[table] = {};
    for (let i = 0; i < sorted.length; i++) {
        adjacencyMap[table][sorted[i].trackID] = [];
        for (let j = i + 1; j < sorted.length; j++) {
            const diff = sorted[j].trackPopularity - sorted[i].trackPopularity;
            if (diff > 5) break;
            if (diff >= 1) adjacencyMap[table][sorted[i].trackID].push(sorted[j].trackID);
        }
    }
};

const getClosePair = (table = 'popular') => {
    const map = adjacencyMap[table];
    const lookup = trackLookup[table];

    const keys = Object.keys(map).filter(id => 
        map[id].length > 0 && 
        map[id].some(neighbourId => lookup[neighbourId].trackPopularity !== lookup[id].trackPopularity)
    );

    if (keys.length === 0) return null;

    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const neighbours = map[randomKey];

    const randomNeighbour = neighbours[Math.floor(Math.random() * neighbours.length)];

    const pair = [lookup[randomKey], lookup[randomNeighbour]];
    return Math.random() > 0.5 ? pair : [pair[1], pair[0]];
};

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

const populateFromPlaylist = async (playlistID, table, minPop = 70, maxPop = 100) => {
    const token = await accessToken();
    const allTracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistID}/tracks?limit=100`;

    while (url) {
        const res = await fetch(url, {
            headers: { Authorization: 'Bearer ' + token }
        });
        const data = await res.json();

        const filtered = data.items
            .filter(item => item.track && isOriginal(item.track.name))
            .filter(item => item.track.popularity >= minPop && item.track.popularity <= maxPop)
            .map(item => ({
                trackID: item.track.id,
                trackName: item.track.name,
                artist: item.track.artists[0].name,
                trackPopularity: item.track.popularity,
                albumURL: item.track.album.images[0].url
            }));

        allTracks.push(...filtered);
        url = data.next;
    }

    await insertTrack(allTracks, table);
    await buildAdjacencyMap(table);
    console.log(`Added ${allTracks.length} tracks from playlist to ${table}`);
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

const Y2K_QUERIES = () => [
    `genre:pop year:2000-2009 ${randomChar()}`,
    `genre:pop-punk year:2000-2009 ${randomChar()}`,
    `genre:alternative-rock year:2000-2009 ${randomChar()}`,
    `genre:hip-hop year:2000-2009 ${randomChar()}`,
    `genre:r-n-b year:2000-2009 ${randomChar()}`,
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

const initializePool = async () => {
    const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM popular');
    const [[{ count: emoCount }]] = await db.execute('SELECT COUNT(*) AS count FROM emo');
    const [[{ count: count2000s }]] = await db.execute('SELECT COUNT(*) AS count FROM 2000s');

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

    if (count2000s === 0 ) {
        await Promise.all([
            populatePool('2000s', 60, 100, Y2K_QUERIES()),
            populatePool('2000s', 60, 100, Y2K_QUERIES()),
            populatePool('2000s', 60, 100, Y2K_QUERIES()),
        ]);
    }

    await buildAdjacencyMap('popular');
    await buildAdjacencyMap('emo');
    await buildAdjacencyMap('2000s')
};

app.get('/api/popular', async (req, res) => {
    try {
        const tracks = await getClosePair('popular');
        res.json(tracks);
    } catch (err) {
        console.error('Error fetching tracks:', err);
        res.status(500).json({ error: 'Failed to fetch tracks' });
    }
});

app.get('/api/emo', async (req, res) => {
    try {
        const tracks = await getClosePair('emo');
        res.json(tracks);
    } catch (err) {
        console.error('Error fetching tracks:', err);
        res.status(500).json({ error: 'Failed to fetch emo tracks' });
    }
});

app.get('/api/2000s', async (req, res) => {
    try {
        const tracks = await getClosePair('2000s');
        res.json(tracks);
    } catch (err) {
        console.error('Error fetching tracks:', err);
        res.status(500).json({ error: 'Failed to fetch 2000s tracks' });
    }
});

app.post('/api/populate', async (req, res) => {
    if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        await populatePool('popular', 70, 100, POPULAR_QUERIES());
        await buildAdjacencyMap('popular');
        const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM popular');
        res.json({ message: 'Popular pool updated', total: count });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to populate' });
    }
});

app.post('/api/populate/emo', async (req, res) => {
    if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        await populatePool('emo', 40, 69, EMO_QUERIES());
        await buildAdjacencyMap('emo');
        const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM emo');
        res.json({ message: 'Emo pool updated', total: count });
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to populate emo pool' });
    }
});

app.post('/api/populate/2000s', async (req, res) => {
    if (req.headers['x-admin-key'] !== process.env.ADMIN_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        await populatePool('2000s', 60, 100, Y2K_QUERIES());
        await buildAdjacencyMap('2000s');
        const [[{ count }]] = await db.execute('SELECT COUNT(*) AS count FROM 2000s');
        res.json({ message: '2000s pool updated', total: count });
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to populate 2000s pool' });
    }
});

app.post('/api/populate/playlist', async (req, res) => {
    try {
        await populateFromPlaylist('37i9dQZEVXbMDoHDwVN2tF', 'popular', 70, 100);
        await populateFromPlaylist('37i9dQZF1EIdh6MgVIhb8B', '2000s', 60, 100);
        res.json({ message: 'Playlist populate done' });
    } catch (err) {
        console.log(err)
        res.status(500).json({ error: 'Failed to populate from playlists' });
    }
});

app.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}`);
    await initializePool();
});