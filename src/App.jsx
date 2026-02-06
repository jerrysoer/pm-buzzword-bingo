import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import html2canvas from 'html2canvas';
import episodes from './data/episodes.json';

// Calculate buzzword frequencies across all episodes
const buzzwordFrequencies = (() => {
  const counts = {};
  episodes.forEach(ep => {
    ep.buzzwordsFound.forEach(bw => {
      counts[bw] = (counts[bw] || 0) + 1;
    });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([word, count]) => ({ word, count, percent: Math.round(count / episodes.length * 100) }));
})();

// Rare buzzwords for hard mode (< 50% frequency)
const rareBuzzwords = new Set(
  buzzwordFrequencies.filter(b => b.percent < 50).map(b => b.word)
);

// Format time as mm:ss
const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

// Analytics wrapper (placeholder for Umami)
const track = (event, data) => {
  try {
    if (window.umami) window.umami.track(event, data);
  } catch {
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

// Get initial seed from URL or generate new
const getInitialSeed = () => {
  const params = new URLSearchParams(window.location.search);
  const seedParam = params.get('seed');
  return seedParam ? parseInt(seedParam, 10) : generateSeed();
};

// Get initial preferences from localStorage
const getStoredPreference = (key, defaultValue) => {
  try {
    const stored = localStorage.getItem(`bingo-${key}`);
    return stored !== null ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const setStoredPreference = (key, value) => {
  try {
    localStorage.setItem(`bingo-${key}`, JSON.stringify(value));
  } catch { /* ignore storage errors */ }
};

// Sound effects using Web Audio API
const createAudioContext = () => {
  try {
    return new (window.AudioContext || window.webkitAudioContext)();
  } catch {
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
  } catch { /* ignore audio errors */ }
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
  } catch { /* ignore audio errors */ }
};

// Seeded random number generator (mulberry32)
const createSeededRandom = (seed) => {
  let t = seed + 0x6D2B79F5;
  return () => {
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};

// Generate a random seed
const generateSeed = () => Math.floor(Math.random() * 2147483647);

// Fisher-Yates shuffle (optionally seeded)
const shuffle = (array, seed = null) => {
  const arr = [...array];
  const random = seed !== null ? createSeededRandom(seed) : Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Generate bingo card from episode buzzwords
const generateCard = (episode, seed = null, hardMode = false) => {
  let buzzwords = episode.buzzwordsFound;
  if (hardMode) {
    buzzwords = buzzwords.filter(bw => rareBuzzwords.has(bw));
    // Fall back to all buzzwords if not enough rare ones
    if (buzzwords.length < 24) buzzwords = episode.buzzwordsFound;
  }
  const shuffled = shuffle(buzzwords, seed);
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
  const [currentSeed, setCurrentSeed] = useState(getInitialSeed);
  const [isDark, setIsDark] = useState(() => getStoredPreference('dark', false));
  const [isMuted, setIsMuted] = useState(() => getStoredPreference('muted', false));
  const [isHardMode, setIsHardMode] = useState(() => getStoredPreference('hardMode', false));
  const [cells, setCells] = useState(() => generateCard(getInitialEpisode(), getInitialSeed(), getStoredPreference('hardMode', false)));
  const [marked, setMarked] = useState(() => new Set([12])); // FREE space
  const [hasBingo, setHasBingo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [splatVariants] = useState(() => Array.from({ length: 25 }, () => Math.floor(Math.random() * 3)));
  const [cardKey, setCardKey] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [hoveredCell, setHoveredCell] = useState(null);
  const audioCtxRef = useRef(null);
  const cardRef = useRef(null);
  const timerRef = useRef(null);

  const score = marked.size - 1; // Exclude FREE space

  // Persist preferences to localStorage
  useEffect(() => { setStoredPreference('dark', isDark); }, [isDark]);
  useEffect(() => { setStoredPreference('muted', isMuted); }, [isMuted]);
  useEffect(() => { setStoredPreference('hardMode', isHardMode); }, [isHardMode]);

  // Apply dark mode class to document
  useEffect(() => {
    document.documentElement.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('dark-mode', isDark);
  }, [isDark]);

  // Toggle hard mode (regenerates card)
  const toggleHardMode = useCallback(() => {
    const newHardMode = !isHardMode;
    setIsHardMode(newHardMode);
    const seed = generateSeed();
    setCurrentSeed(seed);
    setCells(generateCard(currentEpisode, seed, newHardMode));
    setMarked(new Set([12]));
    setHasBingo(false);
    setCardKey(k => k + 1);
    setElapsedTime(0);
    track('hard-mode-toggle', { enabled: newHardMode });
  }, [isHardMode, currentEpisode]);

  // Timer effect
  useEffect(() => {
    if (!hasBingo) {
      timerRef.current = setInterval(() => {
        setElapsedTime(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [hasBingo, cardKey]);

  // Initialize audio context on first user interaction
  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = createAudioContext();
    }
    return audioCtxRef.current;
  }, []);

  // Update URL when episode or seed changes
  useEffect(() => {
    const slug = toSlug(currentEpisode.guest);
    const url = new URL(window.location.href);
    url.searchParams.set('episode', slug);
    url.searchParams.set('seed', currentSeed.toString());
    window.history.replaceState({}, '', url);
  }, [currentEpisode, currentSeed]);

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
        if (!isMuted) playStampSound(ctx);
      }
      const bingo = checkBingo(next);
      if (bingo && !hasBingo) {
        setHasBingo(true);
        if (!isMuted) setTimeout(() => playBingoSound(ctx), 100);
        track('bingo', { guest: currentEpisode.guest, score: next.size - 1 });
      } else if (!bingo && hasBingo) {
        setHasBingo(false);
      }
      return next;
    });
  }, [hasBingo, currentEpisode, ensureAudioContext, isMuted]);

  // New random episode
  const newCard = useCallback(() => {
    const ep = episodes[Math.floor(Math.random() * episodes.length)];
    const seed = generateSeed();
    setCurrentEpisode(ep);
    setCurrentSeed(seed);
    setCells(generateCard(ep, seed, isHardMode));
    setMarked(new Set([12]));
    setHasBingo(false);
    setCardKey(k => k + 1);
    setElapsedTime(0);
    track('new-card', { guest: ep.guest, episode: ep.title, hardMode: isHardMode });
  }, [isHardMode]);

  // Reshuffle same episode
  const reshuffle = useCallback(() => {
    const seed = generateSeed();
    setCurrentSeed(seed);
    setCells(generateCard(currentEpisode, seed, isHardMode));
    setMarked(new Set([12]));
    setHasBingo(false);
    setCardKey(k => k + 1);
    setElapsedTime(0);
    track('reshuffle', { guest: currentEpisode.guest, hardMode: isHardMode });
  }, [currentEpisode, isHardMode]);

  // Select specific episode
  const selectEpisode = useCallback((ep) => {
    const seed = generateSeed();
    setCurrentEpisode(ep);
    setCurrentSeed(seed);
    setCells(generateCard(ep, seed, isHardMode));
    setMarked(new Set([12]));
    setHasBingo(false);
    setShowPicker(false);
    setSearchQuery('');
    setCardKey(k => k + 1);
    setElapsedTime(0);
    track('episode-selected', { guest: ep.guest, hardMode: isHardMode });
  }, [isHardMode]);

  // Screenshot download
  const downloadScreenshot = useCallback(async () => {
    if (!cardRef.current) return;
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#FFFDF5',
        scale: 2,
        useCORS: true,
        logging: false,
        onclone: (clonedDoc) => {
          // Fix grid rendering by removing animations and ensuring visibility
          const clonedCard = clonedDoc.querySelector('[data-card]');
          if (clonedCard) {
            // Remove all animations
            clonedCard.querySelectorAll('*').forEach(el => {
              el.style.animation = 'none';
              el.style.opacity = '1';
              el.style.transform = 'none';
            });
            // Ensure grid cells are visible
            clonedCard.querySelectorAll('[data-cell]').forEach(el => {
              el.style.opacity = '1';
              el.style.transform = 'scale(1)';
            });
          }
        }
      });
      const link = document.createElement('a');
      link.download = `bingo-${toSlug(currentEpisode.guest)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      track('screenshot-downloaded', { guest: currentEpisode.guest });
    } catch (e) {
      console.error('Screenshot failed:', e);
    }
  }, [currentEpisode]);

  // Share (includes seed for exact card reproduction)
  const share = useCallback(async () => {
    const episodeUrl = `https://jerrysoer.github.io/pm-buzzword-bingo/?episode=${toSlug(currentEpisode.guest)}&seed=${currentSeed}`;
    const text = hasBingo
      ? `🎯 BINGO! Checked ${score} squares playing PM Buzzword Bingo listening to ${currentEpisode.guest} on @LennysPodcast!\n\n▶ Play along with this episode: ${currentEpisode.youtubeUrl}\n🎲 Get the same card → ${episodeUrl}`
      : `Listening to ${currentEpisode.guest} on @LennysPodcast — ${score}/24 squares checked on PM Buzzword Bingo so far 🎲\n\n▶ Episode: ${currentEpisode.youtubeUrl}\nPlay the same card → ${episodeUrl}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      track('share-copied', { guest: currentEpisode.guest, hasBingo, seed: currentSeed });
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  }, [currentEpisode, score, hasBingo, currentSeed]);

  // Toggle functions with tracking
  const toggleMute = useCallback((source = 'button') => {
    setIsMuted(m => {
      track('mute-toggle', { muted: !m, source });
      return !m;
    });
  }, []);

  const toggleDarkMode = useCallback((source = 'button') => {
    setIsDark(d => {
      track('dark-mode-toggle', { dark: !d, source });
      return !d;
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        // Mark hovered cell, or first unmarked cell
        if (hoveredCell !== null && hoveredCell !== 12 && !marked.has(hoveredCell)) {
          toggleCell(hoveredCell);
          track('keyboard-shortcut', { key: 'space', action: 'mark-cell' });
        } else {
          const firstUnmarked = cells.findIndex((_, i) => i !== 12 && !marked.has(i));
          if (firstUnmarked !== -1) {
            toggleCell(firstUnmarked);
            track('keyboard-shortcut', { key: 'space', action: 'mark-cell' });
          }
        }
      } else if (e.key === 'r' || e.key === 'R') {
        reshuffle();
        track('keyboard-shortcut', { key: 'r', action: 'reshuffle' });
      } else if (e.key === 'n' || e.key === 'N') {
        newCard();
        track('keyboard-shortcut', { key: 'n', action: 'new-card' });
      } else if (e.key === 'm' || e.key === 'M') {
        toggleMute('keyboard');
        track('keyboard-shortcut', { key: 'm', action: 'toggle-mute' });
      } else if (e.key === 'd' || e.key === 'D') {
        toggleDarkMode('keyboard');
        track('keyboard-shortcut', { key: 'd', action: 'toggle-dark' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hoveredCell, marked, cells, toggleCell, reshuffle, newCard, toggleMute, toggleDarkMode]);

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        :root {
          --bg-main: #F5EDD6;
          --bg-card: #FFFDF5;
          --bg-cell: #FFFBF0;
          --text-primary: #1B3A5C;
          --text-secondary: #3A3225;
          --text-muted: #9C8E72;
          --text-muted-alt: #6B5F4B;
          --accent-primary: #C43E1C;
          --accent-secondary: #E8A838;
          --accent-tertiary: #F2D06B;
          --border-light: #D6CDB8;
          --border-dark: #1B3A5C;
          --vignette: rgba(58,50,37,0.12);
        }
        .dark-mode {
          --bg-main: #1a1a2e;
          --bg-card: #16213e;
          --bg-cell: #1f2940;
          --text-primary: #e8d5b7;
          --text-secondary: #d4c4a8;
          --text-muted: #8b7f6a;
          --text-muted-alt: #a09080;
          --accent-primary: #e85d4c;
          --accent-secondary: #f0b638;
          --accent-tertiary: #f5d96b;
          --border-light: #2a3a5c;
          --border-dark: #e8d5b7;
          --vignette: rgba(0,0,0,0.3);
        }
        body {
          margin: 0;
          font-family: 'Outfit', sans-serif;
          background: var(--bg-main);
          background-image:
            radial-gradient(circle at 15% 15%, rgba(196,62,28,0.04) 0%, transparent 50%),
            radial-gradient(circle at 85% 85%, rgba(27,58,92,0.04) 0%, transparent 50%),
            url("data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='10' cy='10' r='1' fill='%23D6CDB8' opacity='0.5'/%3E%3C/svg%3E");
          min-height: 100vh;
          transition: background 0.3s;
        }
        .dark-mode body, body.dark-mode {
          background-image:
            radial-gradient(circle at 15% 15%, rgba(232,93,76,0.08) 0%, transparent 50%),
            radial-gradient(circle at 85% 85%, rgba(232,213,183,0.04) 0%, transparent 50%);
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
        background: `radial-gradient(ellipse at center, transparent 0%, transparent 60%, var(--vignette) 100%)`,
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
              color: 'var(--text-primary)',
              letterSpacing: '0.04em',
              margin: 0,
              textShadow: '2px 2px 0 rgba(27,58,92,0.1)',
            }}>BUZZWORD</h1>
            <BingoCage />
          </div>
          <h2 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(52px, 11vw, 78px)',
            color: 'var(--accent-primary)',
            letterSpacing: '0.06em',
            margin: '-8px 0 8px',
            textShadow: '3px 3px 0 rgba(196,62,28,0.15)',
          }}>BINGO!</h2>
          <p style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            margin: 0,
          }}>As heard on Lenny's Podcast</p>
        </header>

        {/* Settings Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}>
          {/* Dark Mode */}
          <button
            onClick={() => toggleDarkMode('button')}
            title="Toggle dark mode (D)"
            style={{
              background: 'var(--bg-card)',
              border: '2px solid var(--border-light)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s',
            }}
          >
            {isDark ? '☀️' : '🌙'} {isDark ? 'Light' : 'Dark'}
          </button>

          {/* Mute */}
          <button
            onClick={() => toggleMute('button')}
            title="Toggle sound (M)"
            style={{
              background: 'var(--bg-card)',
              border: '2px solid var(--border-light)',
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s',
            }}
          >
            {isMuted ? '🔇' : '🔊'} {isMuted ? 'Muted' : 'Sound'}
          </button>

          {/* Hard Mode */}
          <button
            onClick={toggleHardMode}
            title="Hard mode: rare buzzwords only"
            style={{
              background: isHardMode ? 'var(--accent-primary)' : 'var(--bg-card)',
              border: `2px solid ${isHardMode ? 'var(--accent-primary)' : 'var(--border-light)'}`,
              borderRadius: 8,
              padding: '6px 12px',
              fontSize: 13,
              fontWeight: isHardMode ? 700 : 500,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer',
              color: isHardMode ? 'white' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s',
            }}
          >
            {isHardMode ? '🔥' : '😎'} {isHardMode ? 'Hard Mode' : 'Normal'}
          </button>
        </div>

        {/* Guest Badge */}
        <div style={{ textAlign: 'center', marginBottom: 16, animation: 'slideDown 0.5s ease-out' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--text-primary)',
            padding: '8px 10px 8px 14px',
            borderRadius: 100,
            boxShadow: '0 3px 12px rgba(27,58,92,0.2)',
          }}>
            <span style={{ fontSize: 13 }}>🎙️</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-tertiary)' }}>{currentEpisode.guest}</span>
            <a
              href={currentEpisode.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('youtube-click', { guest: currentEpisode.guest, videoId: currentEpisode.videoId })}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                background: 'var(--accent-primary)',
                color: 'white',
                fontSize: 11,
                fontWeight: 600,
                padding: '5px 10px',
                borderRadius: 100,
                textDecoration: 'none',
                transition: 'all 0.15s',
              }}
            >
              ▶ Watch
            </a>
          </div>
          <p style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            margin: '8px 0 0',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: '90%',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}>{currentEpisode.title}</p>
        </div>

        {/* Bingo Card */}
        <div ref={cardRef} data-card style={{
          background: 'var(--bg-card)',
          border: '4px solid var(--border-dark)',
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
              border: '2px solid var(--accent-primary)',
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
                color: hasBingo ? 'var(--accent-primary)' : 'var(--text-primary)',
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
                  data-cell
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
                      background: 'linear-gradient(135deg, var(--accent-tertiary) 0%, var(--accent-secondary) 100%)',
                      border: '3px solid #C49520',
                      boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                    } : isMarked ? {
                      background: isDark ? 'rgba(232,93,76,0.15)' : 'rgba(196,62,28,0.06)',
                      border: '2px solid var(--accent-primary)',
                    } : {
                      background: 'var(--bg-cell)',
                      border: '2px solid var(--border-light)',
                    }),
                  }}
                  onMouseEnter={e => {
                    setHoveredCell(i);
                    if (!isFree) {
                      e.currentTarget.style.transform = 'scale(1.06)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)';
                    }
                  }}
                  onMouseLeave={e => {
                    setHoveredCell(null);
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
                      color: 'var(--accent-primary)',
                      opacity: 0.55,
                      animation: 'checkPop 0.25s cubic-bezier(.34,1.56,.64,1) 0.1s both',
                      zIndex: 2,
                    }}>✕</span>
                  )}

                  {/* Free space star */}
                  {isFree && (
                    <span style={{ fontSize: 14, opacity: 0.6, color: isDark ? '#c4a870' : '#5C3A0A' }}>★</span>
                  )}

                  {/* Cell text */}
                  <span style={{
                    fontFamily: "'Outfit', sans-serif",
                    fontSize: 'clamp(10px, 2.5vw, 13px)',
                    fontWeight: isFree ? 800 : isMarked ? 700 : 500,
                    color: isFree ? (isDark ? '#c4a870' : '#5C3A0A') : isMarked ? 'var(--accent-primary)' : 'var(--text-secondary)',
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
          {/* Score & Timer */}
          <div style={{
            background: 'var(--bg-card)',
            border: '3px solid var(--border-dark)',
            borderRadius: 12,
            padding: '8px 16px',
            boxShadow: '3px 3px 0 rgba(27,58,92,0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 32,
                color: 'var(--accent-primary)',
              }}>{score}</span>
              <span style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text-muted)',
              }}>/24</span>
            </div>
            <div style={{ width: 1, height: 24, background: 'var(--border-light)' }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 24,
                color: hasBingo ? 'var(--accent-secondary)' : 'var(--text-primary)',
              }}>{formatTime(elapsedTime)}</span>
              <span style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--text-muted)',
              }}>⏱️</span>
            </div>
          </div>

          {/* Screenshot */}
          <button
            onClick={downloadScreenshot}
            style={{
              background: 'var(--bg-card)',
              border: '2px solid var(--border-light)',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
              color: 'var(--text-secondary)',
            }}
          >
            📸 Save
          </button>

          {/* Share */}
          <button
            onClick={share}
            style={{
              background: 'var(--bg-card)',
              border: '2px solid var(--border-light)',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
              color: 'var(--text-secondary)',
            }}
          >
            {copied ? '✓ Copied!' : '📋 Share'}
          </button>

          {/* Reshuffle */}
          <button
            onClick={reshuffle}
            style={{
              background: 'var(--bg-card)',
              border: '2px solid var(--border-light)',
              borderRadius: 10,
              padding: '10px 16px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer',
              transition: 'all 0.15s',
              color: 'var(--text-secondary)',
            }}
          >
            🔀 Reshuffle
          </button>

          {/* New Card */}
          <button
            onClick={newCard}
            style={{
              background: 'var(--accent-primary)',
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
              background: 'var(--bg-card)',
              border: '2px solid var(--border-light)',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer',
              color: 'var(--text-secondary)',
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
              background: 'var(--bg-card)',
              border: '2px solid var(--border-light)',
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
                  borderBottom: '1px solid var(--border-light)',
                  fontSize: 14,
                  fontFamily: "'Outfit', sans-serif",
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
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
                      borderBottom: '1px solid var(--border-light)',
                      background: ep === currentEpisode ? (isDark ? 'rgba(240,182,56,0.2)' : 'rgba(232,168,56,0.15)') : 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: "'Outfit', sans-serif",
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ep.guest}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.title}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* How to Play */}
        <div style={{
          marginTop: 24,
          background: 'var(--bg-card)',
          border: '2px dashed var(--border-light)',
          borderRadius: 14,
          padding: 20,
        }}>
          <h3 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 18,
            color: 'var(--text-primary)',
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
                <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{num}</span>
                <span style={{ fontSize: 13, color: 'var(--text-muted-alt)', lineHeight: 1.4 }}>{text}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '12px 0 0', textAlign: 'center' }}>
            Keyboard: Space=mark, R=reshuffle, N=new, M=mute, D=dark
          </p>
        </div>

        {/* Buzzword Stats */}
        <div style={{ marginTop: 24 }}>
          <button
            onClick={() => setShowStats(!showStats)}
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: '2px solid var(--border-light)',
              borderRadius: 10,
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "'Outfit', sans-serif",
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>📊 Buzzword Frequency Heatmap</span>
            <span style={{ transform: showStats ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
          </button>

          {showStats && (
            <div style={{
              marginTop: 8,
              background: 'var(--bg-card)',
              border: '2px solid var(--border-light)',
              borderRadius: 10,
              padding: 16,
              maxHeight: 300,
              overflowY: 'auto',
            }}>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 12px', textAlign: 'center' }}>
                How often each buzzword appears across {episodes.length} episodes
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {buzzwordFrequencies.slice(0, 30).map(({ word, percent }) => (
                  <div key={word} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      flex: 1,
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>{word}</div>
                    <div style={{
                      width: 120,
                      height: 16,
                      background: 'var(--bg-main)',
                      borderRadius: 8,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        width: `${percent}%`,
                        height: '100%',
                        background: percent > 80 ? 'var(--accent-primary)' : percent > 50 ? 'var(--accent-secondary)' : 'var(--text-primary)',
                        borderRadius: 8,
                        transition: 'width 0.3s',
                      }} />
                    </div>
                    <div style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: 'var(--text-muted)',
                      width: 36,
                      textAlign: 'right',
                    }}>{percent}%</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '12px 0 0', textAlign: 'center' }}>
                🔴 &gt;80% &nbsp; 🟠 50-80% &nbsp; 🔵 &lt;50%
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer style={{ marginTop: 32, textAlign: 'center' }}>
          <div style={{ width: '60%', height: 1, background: 'var(--border-light)', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 6px' }}>
            Created by jerrysoer × Claude
          </p>
          <p style={{ fontSize: 12, margin: '0 0 6px' }}>
            <a
              href="https://www.lennysnewsletter.com/subscribe"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent-secondary)', textDecoration: 'none' }}
            >
              Subscribe to Lenny's Newsletter →
            </a>
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
            Transcripts via{' '}
            <a
              href="https://github.com/ChatPRD/lennys-podcast-transcripts"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--text-muted)' }}
            >
              ChatPRD
            </a>
          </p>
        </footer>
      </div>
    </>
  );
}
