import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import episodes from './data/episodes.json';

// Analytics wrapper (placeholder for Umami)
const track = (event, data) => {
  try {
    if (window.umami) window.umami.track(event, data);
  } catch (e) {
    // Analytics failure should never affect the app
  }
};

// Convert guest name to URL slug
const toSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Find episode by slug
const findEpisodeBySlug = (slug) => {
  if (!slug) return null;
  return episodes.find(e => toSlug(e.guest) === slug);
};

// Get initial episode from URL or random
const getInitialEpisode = () => {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('episode');
  const found = findEpisodeBySlug(slug);
  return found || episodes[Math.floor(Math.random() * episodes.length)];
};

// Sound effects using Web Audio API
const createAudioContext = () => {
  try {
    return new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    return null;
  }
};

const playStampSound = (audioCtx) => {
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.1);
  } catch (e) {}
};

const playBingoSound = (audioCtx) => {
  if (!audioCtx) return;
  try {
    const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.15);
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.15 + 0.3);
      osc.start(audioCtx.currentTime + i * 0.15);
      osc.stop(audioCtx.currentTime + i * 0.15 + 0.3);
    });
  } catch (e) {}
};

// Fisher-Yates shuffle
const shuffle = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Generate bingo card from episode buzzwords
const generateCard = (episode) => {
  const shuffled = shuffle(episode.buzzwordsFound);
  const cells = shuffled.slice(0, 24);
  cells.splice(12, 0, 'FREE');
  return cells;
};

// Check for bingo
const WINNING_LINES = [
  [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14], [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
  [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22], [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
  [0, 6, 12, 18, 24], [4, 8, 12, 16, 20]
];

const checkBingo = (marked) => {
  return WINNING_LINES.some(line => line.every(i => marked.has(i)));
};

// Ink splat SVG variants
const InkSplatA = () => (
  <svg viewBox="0 0 100 100" style={{ width: '130%', height: '130%', position: 'absolute', top: '-15%', left: '-15%' }}>
    <circle cx="50" cy="50" r="38" fill="rgba(196,62,28,0.18)" />
    <circle cx="25" cy="35" r="8" fill="rgba(196,62,28,0.12)" />
    <circle cx="72" cy="68" r="6" fill="rgba(196,62,28,0.14)" />
    <circle cx="78" cy="30" r="5" fill="rgba(196,62,28,0.10)" />
  </svg>
);

const InkSplatB = () => (
  <svg viewBox="0 0 100 100" style={{ width: '130%', height: '130%', position: 'absolute', top: '-15%', left: '-15%' }}>
    <path d="M50 10 L60 40 L90 50 L60 60 L50 90 L40 60 L10 50 L40 40 Z" fill="rgba(196,62,28,0.16)" />
    <circle cx="30" cy="25" r="5" fill="rgba(196,62,28,0.12)" />
    <circle cx="75" cy="75" r="4" fill="rgba(196,62,28,0.10)" />
  </svg>
);

const InkSplatC = () => (
  <svg viewBox="0 0 100 100" style={{ width: '130%', height: '130%', position: 'absolute', top: '-15%', left: '-15%' }}>
    <ellipse cx="50" cy="50" rx="42" ry="35" fill="rgba(196,62,28,0.17)" transform="rotate(-15 50 50)" />
    <circle cx="20" cy="55" r="7" fill="rgba(196,62,28,0.11)" />
    <circle cx="80" cy="40" r="5" fill="rgba(196,62,28,0.13)" />
    <circle cx="65" cy="75" r="4" fill="rgba(196,62,28,0.09)" />
  </svg>
);

const INK_SPLATS = [InkSplatA, InkSplatB, InkSplatC];

// Bingo cage SVG
const BingoCage = () => (
  <svg width="48" height="48" viewBox="0 0 64 64" style={{ animation: 'spin 8s linear infinite' }}>
    <circle cx="32" cy="32" r="28" fill="none" stroke="#1B3A5C" strokeWidth="2" opacity="0.3" />
    <circle cx="32" cy="32" r="20" fill="none" stroke="#1B3A5C" strokeWidth="1.5" opacity="0.2" />
    <ellipse cx="32" cy="32" rx="24" ry="12" fill="none" stroke="#1B3A5C" strokeWidth="1.5" opacity="0.4" transform="rotate(45 32 32)" />
    <ellipse cx="32" cy="32" rx="24" ry="12" fill="none" stroke="#1B3A5C" strokeWidth="1.5" opacity="0.4" transform="rotate(-45 32 32)" />
    <circle cx="32" cy="32" r="8" fill="#E8A838" opacity="0.8" />
    <circle cx="24" cy="38" r="4" fill="#C43E1C" opacity="0.5" />
    <circle cx="40" cy="26" r="3" fill="#1B3A5C" opacity="0.5" />
  </svg>
);

// Confetti component
const Confetti = () => {
  const pieces = useMemo(() => {
    const colors = ['#C43E1C', '#E8A838', '#1B3A5C', '#D4644A', '#F2D06B', '#8B2500'];
    return Array.from({ length: 80 }, (_, i) => ({
      id: i,
      color: colors[Math.floor(Math.random() * colors.length)],
      left: Math.random() * 100,
      size: 5 + Math.random() * 12,
      delay: Math.random() * 1.5,
      duration: 2 + Math.random() * 2.5,
      isCircle: Math.random() > 0.5,
    }));
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
      {pieces.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: -20,
            width: p.size,
            height: p.isCircle ? p.size : p.size * 0.6,
            backgroundColor: p.color,
            borderRadius: p.isCircle ? '50%' : '2px',
            animation: `confettiFall ${p.duration}s ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
};

export default function App() {
  const [currentEpisode, setCurrentEpisode] = useState(getInitialEpisode);
  const [cells, setCells] = useState(() => generateCard(currentEpisode));
  const [marked, setMarked] = useState(() => new Set([12])); // FREE space
  const [hasBingo, setHasBingo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [splatVariants] = useState(() => Array.from({ length: 25 }, () => Math.floor(Math.random() * 3)));
  const [cardKey, setCardKey] = useState(0);
  const audioCtxRef = useRef(null);

  const score = marked.size - 1; // Exclude FREE space

  // Initialize audio context on first user interaction
  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = createAudioContext();
    }
    return audioCtxRef.current;
  }, []);

  // Update URL when episode changes
  useEffect(() => {
    const slug = toSlug(currentEpisode.guest);
    const url = new URL(window.location.href);
    url.searchParams.set('episode', slug);
    window.history.replaceState({}, '', url);
  }, [currentEpisode]);

  // Filter episodes for picker
  const filteredEpisodes = useMemo(() => {
    if (!searchQuery.trim()) return episodes;
    const q = searchQuery.toLowerCase();
    return episodes.filter(e =>
      e.guest.toLowerCase().includes(q) ||
      e.title.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Toggle cell marking
  const toggleCell = useCallback((index) => {
    if (index === 12) return; // Can't toggle FREE
    const ctx = ensureAudioContext();
    setMarked(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
        playStampSound(ctx);
      }
      const bingo = checkBingo(next);
      if (bingo && !hasBingo) {
        setHasBingo(true);
        setTimeout(() => playBingoSound(ctx), 100);
        track('bingo', { guest: currentEpisode.guest, score: next.size - 1 });
      } else if (!bingo && hasBingo) {
        setHasBingo(false);
      }
      return next;
    });
  }, [hasBingo, currentEpisode, ensureAudioContext]);

  // New random episode
  const newCard = useCallback(() => {
    const ep = episodes[Math.floor(Math.random() * episodes.length)];
    setCurrentEpisode(ep);
    setCells(generateCard(ep));
    setMarked(new Set([12]));
    setHasBingo(false);
    setCardKey(k => k + 1);
    track('new-card', { guest: ep.guest, episode: ep.title });
  }, []);

  // Reshuffle same episode
  const reshuffle = useCallback(() => {
    setCells(generateCard(currentEpisode));
    setMarked(new Set([12]));
    setHasBingo(false);
    setCardKey(k => k + 1);
  }, [currentEpisode]);

  // Select specific episode
  const selectEpisode = useCallback((ep) => {
    setCurrentEpisode(ep);
    setCells(generateCard(ep));
    setMarked(new Set([12]));
    setHasBingo(false);
    setShowPicker(false);
    setSearchQuery('');
    setCardKey(k => k + 1);
    track('episode-selected', { guest: ep.guest });
  }, []);

  // Share
  const share = useCallback(async () => {
    const episodeUrl = `https://jerrysoer.github.io/pm-buzzword-bingo/?episode=${toSlug(currentEpisode.guest)}`;
    const text = hasBingo
      ? `🎯 BINGO! Checked ${score} squares playing PM Buzzword Bingo listening to ${currentEpisode.guest} on @LennysPodcast!\n\n▶ Play along with this episode: ${currentEpisode.youtubeUrl}\n🎲 Get your own card → ${episodeUrl}`
      : `Listening to ${currentEpisode.guest} on @LennysPodcast — ${score}/24 squares checked on PM Buzzword Bingo so far 🎲\n\n▶ Episode: ${currentEpisode.youtubeUrl}\nPlay along → ${episodeUrl}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      track('share-copied', { guest: currentEpisode.guest, hasBingo });
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  }, [currentEpisode, score, hasBingo]);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: 'Outfit', sans-serif;
          background: #F5EDD6;
          background-image:
            radial-gradient(circle at 15% 15%, rgba(196,62,28,0.04) 0%, transparent 50%),
            radial-gradient(circle at 85% 85%, rgba(27,58,92,0.04) 0%, transparent 50%),
            url("data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='1' fill='%23D6CDB8' opacity='0.5'/%3E%3C/svg%3E");
          min-height: 100vh;
        }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.7) rotate(-3deg); } to { opacity: 1; transform: scale(1) rotate(0); } }
        @keyframes stampIn { from { transform: scale(0) rotate(-30deg); opacity: 0; } to { transform: scale(1) rotate(0deg); opacity: 1; } }
        @keyframes checkPop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 0.55; } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes bannerSlam {
          0% { transform: scale(2.5) rotate(-8deg); opacity: 0; }
          60% { transform: scale(0.95) rotate(1deg); opacity: 1; }
          100% { transform: scale(1) rotate(-1deg); opacity: 1; }
        }
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(1080deg); opacity: 0; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
        @keyframes scanline {
          from { transform: translateY(0); }
          to { transform: translateY(4px); }
        }
      `}</style>

      {/* CRT Scanline overlay */}
      <div style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9998,
        background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,0,0,0.015) 2px, rgba(0,0,0,0.015) 4px)',
        animation: 'scanline 15s linear infinite',
      }} />

      {/* Vignette */}
      <div style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9997,
        background: 'radial-gradient(ellipse at center, transparent 0%, transparent 60%, rgba(58,50,37,0.12) 100%)',
      }} />

      {hasBingo && <Confetti />}

      <div style={{
        maxWidth: 600,
        margin: '0 auto',
        padding: '20px 20px 48px',
      }}>
        {/* Header */}
        <header style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 4 }}>
            <BingoCage />
            <h1 style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 'clamp(42px, 9vw, 64px)',
              color: '#1B3A5C',
              letterSpacing: '0.04em',
              margin: 0,
              textShadow: '2px 2px 0 rgba(27,58,92,0.1)',
            }}>BUZZWORD</h1>
            <BingoCage />
          </div>
          <h2 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(52px, 11vw, 78px)',
            color: '#C43E1C',
            letterSpacing: '0.06em',
            margin: '-8px 0 8px',
            textShadow: '3px 3px 0 rgba(196,62,28,0.15)',
          }}>BINGO!</h2>
          <p style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: '#9C8E72',
            margin: 0,
          }}>As heard on Lenny's Podcast</p>
        </header>

        {/* Guest Badge */}
        <div style={{ textAlign: 'center', marginBottom: 20, animation: 'slideDown 0.5s ease-out' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: '#1B3A5C',
            padding: '10px 20px',
            borderRadius: 100,
            boxShadow: '0 3px 12px rgba(27,58,92,0.2)',
          }}>
            <span style={{ fontSize: 15 }}>🎙️</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>Today's Guest</span>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#F2D06B' }}>{currentEpisode.guest}</span>
          </div>
          <p style={{
            fontSize: 12,
            color: '#9C8E72',
            fontStyle: 'italic',
            margin: '10px 0',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
          }}>{currentEpisode.title}</p>
          <a
            href={currentEpisode.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track('youtube-click', { guest: currentEpisode.guest, videoId: currentEpisode.videoId })}
            style={{
              display: 'inline-block',
              background: '#C43E1C',
              color: 'white',
              fontSize: 11,
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: 100,
              textDecoration: 'none',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.target.style.background = '#A33518'; e.target.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.target.style.background = '#C43E1C'; e.target.style.transform = 'translateY(0)'; }}
          >
            ▶ Watch on YouTube
          </a>
        </div>

        {/* Bingo Card */}
        <div style={{
          background: '#FFFDF5',
          border: '4px solid #1B3A5C',
          borderRadius: 16,
          padding: 16,
          boxShadow: '8px 8px 0 rgba(27,58,92,0.1)',
          position: 'relative',
        }}>
          {/* Corner stamps */}
          {[[16, 16], [16, 'auto'], ['auto', 16], ['auto', 'auto']].map(([top, left], i) => (
            <div key={i} style={{
              position: 'absolute',
              top: typeof top === 'number' ? top : 'auto',
              bottom: typeof top === 'number' ? 'auto' : 16,
              left: typeof left === 'number' ? left : 'auto',
              right: typeof left === 'number' ? 'auto' : 16,
              width: 20,
              height: 20,
              borderRadius: '50%',
              border: '2px solid #C43E1C',
              opacity: 0.15,
            }} />
          ))}

          {/* Column Headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 5,
            marginBottom: 8,
          }}>
            {['B', 'I', 'N', 'G', 'O'].map((letter, i) => (
              <div key={letter} style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 'clamp(24px, 5vw, 36px)',
                color: hasBingo ? '#C43E1C' : '#1B3A5C',
                textAlign: 'center',
                textShadow: hasBingo ? '0 0 10px rgba(196,62,28,0.4)' : 'none',
                animation: hasBingo ? `pulse 0.8s ease-in-out infinite ${i * 0.1}s` : 'none',
                transition: 'color 0.3s',
              }}>{letter}</div>
            ))}
          </div>

          {/* Grid */}
          <div key={cardKey} style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 5,
          }}>
            {cells.map((cell, i) => {
              const row = Math.floor(i / 5);
              const col = i % 5;
              const isFree = i === 12;
              const isMarked = marked.has(i);
              const SplatComponent = INK_SPLATS[splatVariants[i]];

              return (
                <div
                  key={i}
                  onClick={() => toggleCell(i)}
                  style={{
                    aspectRatio: '1',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 4,
                    borderRadius: 6,
                    cursor: isFree ? 'default' : 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                    animation: `popIn 0.35s cubic-bezier(.34,1.56,.64,1) ${(row + col) * 0.05}s both`,
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    ...(isFree ? {
                      background: 'linear-gradient(135deg, #F2D06B 0%, #E8A838 100%)',
                      border: '3px solid #C49520',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                    } : isMarked ? {
                      background: 'rgba(196,62,28,0.06)',
                      border: '2px solid #C43E1C',
                    } : {
                      background: '#FFFBF0',
                      border: '2px solid #D6CDB8',
                    }),
                  }}
                  onMouseEnter={e => {
                    if (!isFree) {
                      e.currentTarget.style.transform = 'scale(1.06)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    }
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = isFree ? 'inset 0 2px 4px rgba(0,0,0,0.1)' : 'none';
                  }}
                >
                  {/* Ink splat for marked cells */}
                  {isMarked && !isFree && (
                    <div style={{ position: 'absolute', inset: 0, animation: 'stampIn 0.3s cubic-bezier(.17,.67,.24,1.2)' }}>
                      <SplatComponent />
                    </div>
                  )}

                  {/* Check mark for marked cells */}
                  {isMarked && !isFree && (
                    <span style={{
                      position: 'absolute',
                      fontSize: 'clamp(24px, 4vw, 36px)',
                      color: '#C43E1C',
                      opacity: 0.55,
                      animation: 'checkPop 0.25s cubic-bezier(.34,1.56,.64,1) 0.1s both',
                      zIndex: 2,
                    }}>✕</span>
                  )}

                  {/* Free space star */}
                  {isFree && (
                    <span style={{ fontSize: 14, opacity: 0.6, color: '#5C3A0A' }}>★</span>
                  )}

                  {/* Cell text */}
                  <span style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: 'clamp(10px, 2.5vw, 13px)',
                    fontWeight: isFree ? 800 : isMarked ? 700 : 500,
                    color: isFree ? '#5C3A0A' : isMarked ? '#8B2500' : '#3A3225',
                    textAlign: 'center',
                    lineHeight: 1.15,
                    position: 'relative',
                    zIndex: 1,
                    wordBreak: 'break-word',
                    hyphens: 'auto',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    maxWidth: '100%',
                  }}>
                    {isFree ? 'FREE SPACE' : cell}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Win Banner */}
        {hasBingo && (
          <div style={{
            textAlign: 'center',
            marginTop: 20,
          }}>
            <div style={{
              display: 'inline-block',
              background: 'linear-gradient(135deg, #C43E1C 0%, #E8A838 100%)',
              padding: '14px 40px',
              borderRadius: 12,
              boxShadow: '6px 6px 0 rgba(196,62,28,0.2), 0 8px 32px rgba(196,62,28,0.25)',
              transform: 'rotate(-1deg)',
              animation: 'bannerSlam 0.4s cubic-bezier(.17,.67,.24,1.2)',
            }}>
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 'clamp(32px, 7vw, 48px)',
                color: '#FFFDF5',
                letterSpacing: 6,
              }}>🎯 BINGO! 🎯</span>
            </div>
          </div>
        )}

        {/* Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          marginTop: 20,
          flexWrap: 'wrap',
        }}>
          {/* Score */}
          <div style={{
            background: '#FFFDF5',
            border: '3px solid #1B3A5C',
            borderRadius: 12,
            padding: '8px 16px',
            boxShadow: '3px 3px 0 rgba(27,58,92,0.08)',
            display: 'flex',
            alignItems: 'baseline',
            gap: 4,
          }}>
            <span style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 32,
              color: '#C43E1C',
            }}>{score}</span>
            <span style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#9C8E72',
            }}>/24 stamped</span>
          </div>

          {/* Share */}
          <button
            onClick={share}
            style={{
              background: '#FFFDF5',
              border: '2px solid #D6CDB8',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
              color: '#3A3225',
            }}
            onMouseEnter={e => { e.target.style.borderColor = '#1B3A5C'; e.target.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.target.style.borderColor = '#D6CDB8'; e.target.style.transform = 'translateY(0)'; }}
          >
            {copied ? '✓ Copied!' : '📋 Share'}
          </button>

          {/* Reshuffle */}
          <button
            onClick={reshuffle}
            style={{
              background: '#FFFDF5',
              border: '2px solid #D6CDB8',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
              color: '#3A3225',
            }}
            onMouseEnter={e => { e.target.style.borderColor = '#1B3A5C'; e.target.style.transform = 'translateY(-1px)'; }}
            onMouseLeave={e => { e.target.style.borderColor = '#D6CDB8'; e.target.style.transform = 'translateY(0)'; }}
          >
            🔀 Reshuffle
          </button>

          {/* New Card */}
          <button
            onClick={newCard}
            style={{
              background: '#C43E1C',
              border: 'none',
              borderRadius: 10,
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: "'Outfit', sans-serif",
              color: 'white',
              cursor: 'pointer',
              boxShadow: '3px 3px 0 rgba(196,62,28,0.2)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '4px 4px 0 rgba(196,62,28,0.3)'; }}
            onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '3px 3px 0 rgba(196,62,28,0.2)'; }}
          >
            🔄 New Card
          </button>
        </div>

        {/* Episode Picker */}
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowPicker(!showPicker)}
            style={{
              width: '100%',
              background: '#FFFDF5',
              border: '2px solid #D6CDB8',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer',
              color: '#3A3225',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>🎧 Choose Episode ({episodes.length} available)</span>
            <span style={{ transform: showPicker ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
          </button>

          {showPicker && (
            <div style={{
              marginTop: 8,
              background: '#FFFDF5',
              border: '2px solid #D6CDB8',
              borderRadius: 10,
              overflow: 'hidden',
            }}>
              <input
                type="text"
                placeholder="Search by guest or title..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  border: 'none',
                  borderBottom: '1px solid #D6CDB8',
                  fontSize: 14,
                  fontFamily: "'Outfit', sans-serif",
                  outline: 'none',
                  background: 'transparent',
                }}
              />
              <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                {filteredEpisodes.map((ep, i) => (
                  <button
                    key={i}
                    onClick={() => selectEpisode(ep)}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      border: 'none',
                      borderBottom: '1px solid #D6CDB8',
                      background: ep === currentEpisode ? 'rgba(232,168,56,0.15)' : 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: "'Outfit', sans-serif",
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (ep !== currentEpisode) e.target.style.background = 'rgba(27,58,92,0.05)'; }}
                    onMouseLeave={e => { if (ep !== currentEpisode) e.target.style.background = 'transparent'; }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1B3A5C' }}>{ep.guest}</div>
                    <div style={{ fontSize: 11, color: '#9C8E72', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.title}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* How to Play */}
        <div style={{
          marginTop: 24,
          background: '#FFFDF5',
          border: '2px dashed #D6CDB8',
          borderRadius: 14,
          padding: 20,
        }}>
          <h3 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 18,
            color: '#1B3A5C',
            letterSpacing: 2,
            margin: '0 0 12px',
            textAlign: 'center',
          }}>HOW TO PLAY</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px 16px',
          }}>
            {[
              ['①', 'Pick an episode (or get a random one)'],
              ['②', 'Hit play on YouTube'],
              ['③', 'Tap squares when you hear the phrase'],
              ['④', 'Get 5 in a row → BINGO! Share your score'],
            ].map(([num, text]) => (
              <div key={num} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ color: '#C43E1C', fontWeight: 700 }}>{num}</span>
                <span style={{ fontSize: 13, color: '#6B5F4B', lineHeight: 1.4 }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <footer style={{ marginTop: 32, textAlign: 'center' }}>
          <div style={{ width: '60%', height: 1, background: '#D6CDB8', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 12, color: '#9C8E72', margin: '0 0 6px' }}>
            Created by jerrysoer × Claude
          </p>
          <p style={{ fontSize: 12, margin: '0 0 6px' }}>
            <a
              href="https://www.lennysnewsletter.com/subscribe"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#E8A838', textDecoration: 'none' }}
              onMouseEnter={e => e.target.style.textDecoration = 'underline'}
              onMouseLeave={e => e.target.style.textDecoration = 'none'}
            >
              Subscribe to Lenny's Newsletter →
            </a>
          </p>
          <p style={{ fontSize: 11, color: '#9C8E72', margin: 0 }}>
            Transcripts via{' '}
            <a
              href="https://github.com/ChatPRD/lennys-podcast-transcripts"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#9C8E72' }}
            >
              ChatPRD
            </a>
          </p>
        </footer>
      </div>
    </>
  );
}
