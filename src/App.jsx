import { useState, useEffect } from "react";
import './App.css'

function App() {
    const [mode, setMode] = useState(null);
    const [trackPair, setTrackPair] = useState([null, null]);
    const [seenPairs, setSeenPairs] = useState(new Set());
    const [message, setMessage] = useState('');
    const [correct, setCorrect] = useState(0);
    const [loading, setLoading] = useState(true);
    const [streak, setStreak] = useState(0);
    const [flashLeft, setFlashLeft] = useState(null);
    const [flashRight, setFlashRight] = useState(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [scoreFlash, setScoreFlash] = useState(false);
    const [streakFlash, setStreakFlash] = useState(null);
    const [showResult, setShowResult] = useState(false);
    
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
        if (isTransitioning) return;
        setIsTransitioning(true);

        const [trackOne, trackTwo] = trackPair;
        const isCorrect =
        (choice === 'left' && trackOne.trackPopularity > trackTwo.trackPopularity) ||
        (choice === 'right' && trackTwo.trackPopularity > trackOne.trackPopularity);

        setMessage(
            `${isCorrect ? 'Correct!' : 'Incorrect!'}`
        );

        if (isCorrect) {
            setCorrect(c => c + 1);
            setScoreFlash('up');
            setStreak(s => {
                const newStreak = s + 1;
                return newStreak;
            });
            setStreakFlash('up');
        } else {
            setScoreFlash('wrong');
            if (streak > 0) setStreakFlash('reset');
            setStreak(0);
        }
        setTimeout(() => setScoreFlash(null), 400);
        setTimeout(() => setStreakFlash(null), 500);

        if (choice === 'left') {
        setFlashLeft(isCorrect ? 'correct' : 'wrong');
        setFlashRight(isCorrect ? 'wrong' : 'correct');
        } else {
            setFlashRight(isCorrect ? 'correct' : 'wrong');
            setFlashLeft(isCorrect ? 'wrong' : 'correct');
        }
        
        setShowResult(true);
        await new Promise(resolve => setTimeout(resolve, 1700));
        const pair = await getUnseenPair();

        setFlashLeft(null);
        setFlashRight(null);
        setShowResult(false);

        setTrackPair(pair);
        setMessage('');
        setIsTransitioning(false);
    }

    const handleExit = () => {
        setMode(null);
        setTrackPair([null, null]);
        setSeenPairs(new Set());
        setMessage('');
        setCorrect(0);
        setStreak(0);
        setLoading(true);
    };

    const [trackOne, trackTwo] = trackPair;

    if (!mode) {
        return (
            <>
            <h1 className="title">Melodius</h1>
            <p className="tagline">Two tracks. One winner. You decide.</p>
            <div className="mode-select">
                <h2 className="mode-select-title">Mode Select</h2>
                <div className="mode-select-content">
                    <h2 className="select">Normal</h2>
                    <button className="mode-button" onClick={() => setMode('popular')}>
                        Infinite
                    </button>
                    <p>Collection of songs in current rotation.</p>
                    <span className="mode-badge">Every genre · No limits</span>
                </div>
                <div className="mode-row">
                    <div className="mode-select-content">
                        <h2 className="select ">Genre</h2>
                        <button className="mode-button" onClick={() => setMode('emo')}>
                            Emo
                        </button>
                        <p>A collection of emo songs to compare.</p>
                        <span className="mode-badge">Pop-punk · Post-hardcore · Screamo</span>
                    </div>
                    <div className="mode-select-content">
                        <h2 className="select ">Year</h2>
                        <button className="mode-button" onClick={() => setMode('2000s')}>
                            2000s
                        </button>
                        <p>A collection of 2000s songs to compare.</p>
                        <span className="mode-badge">Pop · Hip-Hop · Rock · R&B</span>
                    </div>
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
        <div className="header">
            <button onClick={handleExit} className="exit">← Back</button>
            <div className="stats">
                <h1 className={`score ${scoreFlash === 'up' ? 'score-flash' : scoreFlash === 'wrong' ? 'score-wrong' : ''}`}>Score: {correct}</h1>
                <h1 className={`streak ${streakFlash === 'up' ? 'streak-up' : streakFlash === 'reset' ? 'streak-reset' : ''}`}>Streak: {streak}</h1>
            </div>
            <div className="header-spacer" />
        </div>
        <h1 className={`game-question ${message === 'Correct!' ? 'correct-message' : message === 'Incorrect!' ? 'wrong-message' : ''}`}>
            {message || 'Which track is more popular?'}
        </h1>
        <div className="page-container">
            <div className={`left-side ${flashLeft || ''} ${isTransitioning ? 'disabled' : ''}`} onClick={() => handleClick("left")}>
                <div className="image">
                    <img src={trackOne.albumURL} alt={trackOne.trackName} />
                </div>
                <div className="artist-info">
                    <h1>{trackOne.trackName}</h1>
                    <p>{trackOne.artist}</p>
                </div>
                {showResult && (
                    <div className="popularity-score">
                        <h1>Popularity: {trackOne.trackPopularity}</h1>
                    </div>
                )}    
            </div>
            <div className="vs-divider">VS</div>
            <div className={`right-side ${flashRight || ''} ${isTransitioning ? 'disabled' : ''}`} onClick={() => handleClick("right")}>
                <div className="image">
                    <img src={trackTwo.albumURL} alt={trackTwo.trackName} />
                </div>
                <div className="artist-info">
                    <h1>{trackTwo.trackName}</h1>
                    <p>{trackTwo.artist}</p>
                </div>
                {showResult && (
                    <div className="popularity-score">
                        <h1>Popularity: {trackTwo.trackPopularity}</h1>
                    </div>
                )}
            </div>
        </div>
        </>
    )
}

export default App;