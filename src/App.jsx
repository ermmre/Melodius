import { useState, useEffect } from "react";
import './App.css'

function App() {
    const [mode, setMode] = useState(null);
    const [tracks, setTracks] = useState([]);
    const [trackPair, setTrackPair] = useState([null, null]);
    const [message, setMessage] = useState('');
    const [correct, setCorrect] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchTracks = async () => {
        const endpoint = mode === 'emo' ? '/api/spotify/emo' : '/api/spotify';
        const response = await fetch(`http://localhost:3001${endpoint}`);
        const trackArray = await response.json();
        
        return trackArray;
    }

    const pickPair = (pool) => {
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        
        return {
            pair: shuffled.slice(0, 2),
            remaining: shuffled.slice(2)
        };
    }

    const findClosePair = (pool, maxDiff = 5) => {
        const sorted = [...pool].sort((a, b) => a.trackPopularity - b.trackPopularity);
        
        const closePairs = [];
        for (let i = 0; i < sorted.length - 1; i++) {
            for (let j = i + 1; j < sorted.length; j++) {
                if (sorted[j].trackPopularity - sorted[i].trackPopularity > maxDiff) break;
                closePairs.push([sorted[i], sorted[j]]);
            }
        }

        if (closePairs.length > 0) {
            const pair = closePairs[Math.floor(Math.random() * closePairs.length)];
            const shuffledPair = Math.random() > 0.5 ? pair : [pair[1], pair[0]];
            const remaining = pool.filter(track => !pair.includes(track));
            return { pair: shuffledPair, remaining };
        }
        
        return pickPair(pool);
    };

    useEffect(() => {
        if (!mode) return;
        const init = async () => {
            try {
                const trackArray = await fetchTracks();
                const { pair, remaining } = findClosePair(trackArray);
                setTracks(remaining);
                setTrackPair(pair)
                setLoading(false)
            } catch (error) {
                console.error("Uh oh", error);
            }
        };
        init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode]);

    const handleClick = async (choice) => {
        const [trackOne, trackTwo] = trackPair;
        setMessage("Incorrect!")
        switch (choice) {
            case "left":
                if (trackOne.trackPopularity > trackTwo.trackPopularity) {
                    setMessage(`Correct!`);
                    setCorrect(correct => correct + 1);
                }
                break;
            case "right":
                if (trackTwo.trackPopularity > trackOne.trackPopularity) {
                    setMessage(`Correct!`);
                    setCorrect(correct => correct + 1);
                }
                break;
        }
        
        let pool = tracks;
        if (pool.length < 2) {
            pool = await fetchTracks();
        }

        const { pair, remaining } = findClosePair(pool);
        setTracks(remaining);
        setTrackPair(pair);
    }

    const handleExit = () => {
        setMode(null);
        setTracks([]);
        setTrackPair([null, null]);
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
                <div className="normal-mode">
                    <h2 className="normal-select">Normal</h2>
                    <button className="mode-popular" onClick={() => setMode('popular')}>
                        ♾️ Infinite
                    </button>
                    <p>These are songs people have in their current rotation from every genre!</p>
                </div>
                <div className="genre-mode">
                    <h2 className="genre-select ">Genre</h2>
                    <button className="mode-emo" onClick={() => setMode('emo')}>
                        🖤 Emo
                    </button>
                    <p>A collection of emo songs to compare against each other.</p>
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
            <div className="left-side">
                <div className="image">
                    <img src={trackOne.albumURL} alt={trackOne}></img> 
                </div>
                <div className="artist-info">
                    <h1>{trackOne.trackName}</h1>
                    <p>{trackOne.artist}</p>
                </div>
                <button onClick={() => handleClick("left")} className="left">Left</button>
            </div>
            <div className="right-side">
                <div className="image">
                    <img src={trackTwo.albumURL} alt={trackTwo}></img> 
                </div>
                <div className="artist-info">
                    <h1>{trackTwo.trackName}</h1>
                    <p>{trackTwo.artist}</p>
                </div>
                <button onClick={() => handleClick("right")} className="right">Right</button>
            </div>
        </div>
        <p className="user-message">{message}</p>
        </>
    )
}

export default App;