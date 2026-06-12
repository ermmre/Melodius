import { useState, useEffect } from "react";
import './App.css'

function App() {
    const [mode, setMode] = useState(null);
    const [trackPair, setTrackPair] = useState([null, null]);
    const [seenPairs, setSeenPairs] = useState(new Set());
    const [message, setMessage] = useState('');
    const [correct, setCorrect] = useState(0);
    const [loading, setLoading] = useState(true);
    
    
    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const fetchTracks = async () => {
        const endpoint = 
        mode === 'emo' ? '/api/emo' :
        mode === '2000s' ? '/api/2000s' : 
        '/api/popular';
        const response = await fetch(`${BASE_URL}${endpoint}`);
        return await response.json(); 
    }

    const getUnseenPair = async () => {
        let pair = await fetchTracks();
        let attempts = 0;

        while (attempts < 10) {
            const key = [pair[0].trackID, pair[1].trackID].sort().join('-');
            if (!seenPairs.has(key)) {
                setSeenPairs(prev => new Set(prev).add(key));
                return pair;
            }
            pair = await fetchTracks();
            attempts++;
        }

        return pair;
    };

    useEffect(() => {
        if (!mode) return;
        const init = async () => {
            try {
                const pair = await getUnseenPair();
                setTrackPair(pair);
                setLoading(false);
            } catch (error) {
                console.error("Uh oh", error);
            }
        };
        init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    const handleClick = async (choice) => {
        const [trackOne, trackTwo] = trackPair;
        const isCorrect =
        (choice === 'left' && trackOne.trackPopularity > trackTwo.trackPopularity) ||
        (choice === 'right' && trackTwo.trackPopularity > trackOne.trackPopularity);

        setMessage(
            `${isCorrect ? 'Correct!' : 'Incorrect!'} 
            ${trackOne.trackName} (${trackOne.trackPopularity}) vs 
            ${trackTwo.trackName} (${trackTwo.trackPopularity})`
        );

        if (isCorrect) {
            setCorrect(c => c + 1);
        }

        const pair = await getUnseenPair();
        setTrackPair(pair);
    }

    const handleExit = () => {
        setMode(null);
        setTrackPair([null, null]);
        setSeenPairs(new Set());
        setMessage('');
        setCorrect(0);
        setLoading(true);
    };

    const [trackOne, trackTwo] = trackPair;

    if (!mode) {
        return (
            <>
            <h1 className="title">Melodius</h1>
            <div className="mode-select">
                <h2 className="mode-select-title">Mode Select</h2>
                <div className="mode-select-content">
                    <h2 className="select">Normal</h2>
                    <button className="mode-button" onClick={() => setMode('popular')}>
                        ♾️ Infinite
                    </button>
                    <p>These are songs people have in their current rotation from every genre!</p>
                </div>
                <div className="mode-select-content">
                    <h2 className="select ">Genre</h2>
                    <button className="mode-button" onClick={() => setMode('emo')}>
                        🖤 Emo
                    </button>
                    <p>A collection of emo songs to compare against each other.</p>
                </div>
                <div className="mode-select-content">
                    <h2 className="select">Year</h2>
                    <button className="mode-button" onClick={() => setMode('2000s')}>
                        🤩 2000s
                    </button>
                </div>
            </div>
            </>
        )
    }

    if (loading || !trackOne || !trackTwo) return (
        <>
        <h1 className="title">Melodius</h1>
        <div className="loading">
            <h1 className="loading-message">Loading...</h1>
        </div>
        </>
    )

    return (
        <>
        <h1 className="title">Melodius</h1>
        <div className="header">
            <button onClick={handleExit} className="exit">← Back</button>
            <h1 className="score">Score: {correct}</h1>
        </div>
        <h1 className="game-question">Which track is more popular?</h1>
        <div className="page-container">
            <div className="left-side" onClick={() => handleClick("left")}>
                <div className="image">
                    <img src={trackOne.albumURL} alt={trackOne}></img> 
                </div>
                <div className="artist-info">
                    <h1>{trackOne.trackName}</h1>
                    <p>{trackOne.artist}</p>
                </div>
            </div>
            <div className="right-side" onClick={() => handleClick("right")}>
                <div className="image">
                    <img src={trackTwo.albumURL} alt={trackTwo}></img> 
                </div>
                <div className="artist-info">
                    <h1>{trackTwo.trackName}</h1>
                    <p>{trackTwo.artist}</p>
                </div>
            </div>
        </div>
        <p className="user-message">{message}</p>
        </>
    )
}

export default App;