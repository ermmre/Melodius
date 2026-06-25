import { useState, useEffect, useRef } from "react";
import './App.css'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const MAX_ROUNDS = 20;
const TIME_SEC = 5;

function App() {
    // =========================
    // MODE SETTINGS STATES
    // =========================

    const [mode, setMode] = useState(null);
    const [ready, setReady] = useState(false);
    const [trackPool, setTrackPool] = useState('popular');
    const [gameOver, setGameOver] = useState(false);

    // =========================
    // TRACK DATA STATES
    // =========================

    const [trackPair, setTrackPair] = useState([null, null]);
    const [seenPairs, setSeenPairs] = useState(new Set());

    // =========================
    // GAMEPLAY STATS
    // =========================

    const [message, setMessage] = useState('');
    const [correct, setCorrect] = useState(0);
    const [streak, setStreak] = useState(0);
    const [gameBestStreak, setGameBestStreak] = useState(0);
    const [timeLeft, setTimeLeft] = useState(TIME_SEC);
    const [round, setRound] = useState(1);

    // =========================
    // VISUAL FEEDBACK
    // =========================

    const [showResult, setShowResult] = useState(false);
    const [flashLeft, setFlashLeft] = useState(null);
    const [flashRight, setFlashRight] = useState(null);
    const [scoreFlash, setScoreFlash] = useState(false);
    const [streakFlash, setStreakFlash] = useState(null);

    // =========================
    // LOADING & TRANSITIONS
    // =========================

    const [loading, setLoading] = useState(true);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const isTransitioningRef = useRef(false);
    
    // =========================
    // FETCHING TRACKS FROM BACKEND
    // =========================

    const [trackOne, trackTwo] = trackPair;

    const fetchTracks = async () => {
        const response = await fetch(`${BASE_URL}/api/${trackPool}`);
        return await response.json(); 
    };

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

    // =========================
    // GAMEPLAY LOGIC
    // =========================   

    useEffect(() => {
        if (!mode) return;
        if (!ready) return;
        const init = async () => {
            try {
                setShowResult(false);
                const pair = await getUnseenPair();
                setTrackPair(pair);
                setLoading(false);
            } catch (error) {
                console.error("An error occured:", error);
            }
        };

        init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, ready]);
    
    const advanceRound = async () => {
        if (round >= MAX_ROUNDS) {
            setGameOver(true);
            return;
        }

        const pair = await getUnseenPair();
        setTrackPair(pair);
        setFlashLeft(null);
        setFlashRight(null);
        setShowResult(false);
        setMessage('');
        setTimeLeft(TIME_SEC);
        setRound(r => r + 1);
        setIsTransitioning(false);
        isTransitioningRef.current = false;
    };

    const handleTimeout = async () => {
        if (isTransitioningRef.current) return;
        isTransitioningRef.current = true;
        setIsTransitioning(true);
        setMessage('Time\'s up!');
        setFlashLeft('wrong');
        setFlashRight('wrong');

        await new Promise(resolve => setTimeout(resolve, 1500));
        await advanceRound();
    };

    useEffect(() => {
        if (mode !== 'fast-track' || loading || isTransitioning) return;
        if (timeLeft <= 0) {
            handleTimeout();
            return;
        }

        const timer = setTimeout(() => {
            setTimeLeft(prev => prev - 1);
        }, 1000);

        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeLeft, mode, loading, isTransitioning]);

    const handleClick = async (choice) => {
        if (isTransitioningRef.current) return;
        isTransitioningRef.current = true;
        setIsTransitioning(true);

        const isCorrect =
        (choice === 'left' && 
            trackOne.trackPopularity > trackTwo.trackPopularity) ||
        (choice === 'right' && 
            trackTwo.trackPopularity > trackOne.trackPopularity);

        setMessage(isCorrect ? 'Correct!' : 'Incorrect!');

        if (isCorrect) {
            setCorrect(c => c + 1);
            setScoreFlash('up');
            setStreak(s => {
                const newStreak = s + 1;
                setGameBestStreak(prev => Math.max(prev, newStreak));
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
        await advanceRound();
    };

    const resetGame = (toMenu = false) => {
        if (toMenu) setMode(null);
        setTrackPool('popular')
        setReady(false);

        setShowResult(false);
        setFlashLeft(null);
        setFlashRight(null);
        setMessage('');
        setCorrect(0);
        setStreak(0);
        setGameBestStreak(0);
        setRound(1);
        setGameOver(false);
        
        setTimeLeft(5);
        setLoading(true);
        setIsTransitioning(false);
        isTransitioningRef.current = false;

        setTrackPair([null, null]);
        setSeenPairs(new Set());
    };

    const handleExit = () => resetGame(true);
    const handlePlayAgain = () => resetGame(false);

    const getGameOverMessage = () => {
        if (correct === MAX_ROUNDS) return "20 lucky guesses?";
        if (correct >= 17) return "Too easy huh?";
        if (correct >= 14) return "Not bad... not bad...";
        if (correct >= 11) return "Oh hey, more than half!"
        if (correct === 10) return "Were you even trying?";
        if (correct >= 8) return "Second guessed yourself, eh?";
        return "Ouch... how did you manage that?";
    };

    // =========================
    // RENDER GAME OVER SCREEN
    // =========================  

    if (gameOver) {
        return (
            <div className="game-over">
                <h1>Game Over!</h1>
                <p className="gameover-text">You scored <strong>{correct}</strong> out of {MAX_ROUNDS}</p>
                <p className="gameover-text">Best Streak: {gameBestStreak}</p>
                <p className="gameover-message">{getGameOverMessage()}</p>
                <button onClick={handlePlayAgain} className="mode-button">
                    Play Again
                </button>
                <button onClick={handleExit} className="exit-button">
                    Exit
                </button>
            </div>
        );
    }

    // =========================
    // RENDER MODE SELECT SCREEN
    // =========================  

    if (!mode) {
        return (
            <>
            <h1 className="title">Melodius</h1>
            <p className="tagline">Two tracks. One winner. You decide.</p>
            <div className="mode-select">
                <h2 className="mode-select-title">Mode Select</h2>
                <div className="mode-select-content">
                    <div className="normal-mode">
                        <button className="mode-button" onClick={() => setMode('infinite')}>
                            Infinite
                        </button>
                    </div>
                    <div className="normal-mode">
                        <button className="mode-button" onClick={() => setMode('fast-track')}>
                            Fast Track
                        </button>
                    </div>
                </div>
            </div>
            </>
        )
    }

    // =========================
    // RENDER READY SCREEN
    // =========================  

    if (!ready) return (
        <div className="start-screen">
            <h1>Ready?</h1>
            {mode === 'infinite' && (
                <p className="start-screen-text"> No limits. How many will you get right?</p>
            )}
            {mode === 'fast-track' && (
                <p className="start-screen-text">5 seconds to guess the right song.</p>
            )}
            <div className="pool-select">
                <label className={`pool-option ${trackPool === 'popular' ? 'selected' : ''}`}>
                    <input 
                        type="radio" 
                        name="pool" 
                        value="popular"
                        checked={trackPool === 'popular'}
                        onChange={() => setTrackPool('popular')}
                    />
                    Popular
                </label>
                <label className={`pool-option ${trackPool === 'emo' ? 'selected' : ''}`}>
                    <input 
                        type="radio" 
                        name="pool" 
                        value="emo"
                        checked={trackPool === 'emo'}
                        onChange={() => setTrackPool('emo')}
                    />
                    Emo
                </label>
                <label className={`pool-option ${trackPool === '2000s' ? 'selected' : ''}`}>
                    <input 
                        type="radio" 
                        name="pool" 
                        value="2000s"
                        checked={trackPool === '2000s'}
                        onChange={() => setTrackPool('2000s')}
                    />
                    2000s
                </label>
                <label className={`pool-option ${trackPool === 'latin' ? 'selected' : ''}`}>
                    <input 
                        type="radio" 
                        name="pool" 
                        value="latin"
                        checked={trackPool === 'latin'}
                        onChange={() => setTrackPool('latin')}
                    />
                    Latin
                </label>
            </div>
            <button className="mode-button" onClick={() => setReady(true)}>
                Start
            </button>
            <button onClick={handleExit} className="exit-button">
                Exit
            </button>
        </div>
    );

    // =========================
    // RENDER LOADING SCREEN 
    // =========================  

    if (loading || !trackOne || !trackTwo) { 
        return (
            <div className="loading">
                <h1 className="loading-message">Loading...</h1>
            </div>
        );
    }

    // =========================
    // RENDER GAMEPLAY SCREEN
    // =========================

    return (
        <>
        <div className="header">
            <button onClick={handleExit} className="exit">← Back</button>
            <div className="stats">
                <h1 className={`score ${scoreFlash === 'up' ? 'score-flash' : scoreFlash === 'wrong' ? 'score-wrong' : ''}`}>Score: {correct}</h1>
                <h1 className={`streak ${streakFlash === 'up' ? 'streak-up' : streakFlash === 'reset' ? 'streak-reset' : ''}`}>Streak: {streak}</h1>
                {mode === 'fast-track' && (
                    <>
                        <h1 className="round">Round: {round}/{MAX_ROUNDS}</h1>
                        <h1 className={`timer ${timeLeft <= 3 ? 'timer-urgent' : ''}`}>⏱ {timeLeft}s</h1>
                    </>
                )}
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