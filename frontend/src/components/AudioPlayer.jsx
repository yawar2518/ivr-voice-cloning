// frontend/src/components/AudioPlayer.jsx
import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { formatTime } from '../utils/format';
import './AudioPlayer.css';

const WAVEFORM_BARS = 96;

function drawWaveform(canvas, peaks, progress, accent) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const gap = 2;
  const barWidth = Math.max(2, width / peaks.length - gap);
  const playedBars = peaks.length * progress;

  peaks.forEach((peak, i) => {
    const barHeight = Math.max(3, peak * height * 0.92);
    const x = i * (barWidth + gap);
    const y = (height - barHeight) / 2;
    const played = i < playedBars;
    ctx.fillStyle = played ? accent : '#d4d4d4';
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
    ctx.fill();
  });
}

function placeholderPeaks() {
  return Array.from({ length: WAVEFORM_BARS }, (_, i) => 0.25 + 0.35 * Math.abs(Math.sin(i / 3.7)) + 0.15 * Math.abs(Math.cos(i / 1.9)));
}

export default function AudioPlayer({ audioUrl, durationSeconds, accent = '#0a0a0a', autoPlay = false, compact = false }) {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);

  const [peaks, setPeaks] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(Number(durationSeconds) || 0);

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setCurrentTime(0);
    setDuration(Number(durationSeconds) || 0);

    async function loadWaveform() {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('no web audio');
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new AudioContextClass();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioContext.close();
        if (cancelled) return;

        const channelData = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(channelData.length / WAVEFORM_BARS) || 1;
        const next = [];
        let globalMax = 0;
        for (let i = 0; i < WAVEFORM_BARS; i++) {
          const start = i * blockSize;
          let max = 0;
          for (let j = 0; j < blockSize; j++) {
            const value = Math.abs(channelData[start + j] ?? 0);
            if (value > max) max = value;
          }
          next.push(max);
          if (max > globalMax) globalMax = max;
        }
        setPeaks(next.map((p) => (globalMax ? p / globalMax : p)));
        if (!durationSeconds) setDuration(audioBuffer.duration);
      } catch {
        if (!cancelled) setPeaks(placeholderPeaks());
      }
    }

    if (audioUrl) loadWaveform();
    return () => {
      cancelled = true;
    };
  }, [audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canvasRef.current || !peaks) return;
    const progress = duration ? Math.min(1, currentTime / duration) : 0;
    drawWaveform(canvasRef.current, peaks, progress, accent);
  }, [peaks, currentTime, duration, accent]);

  useEffect(() => {
    if (!canvasRef.current || !peaks) return undefined;
    const observer = new ResizeObserver(() => {
      const progress = duration ? Math.min(1, currentTime / duration) : 0;
      drawWaveform(canvasRef.current, peaks, progress, accent);
    });
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [peaks, currentTime, duration, accent]);

  useEffect(() => {
    if (autoPlay && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [autoPlay, audioUrl]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) audio.pause();
    else audio.play().catch(() => {});
  }

  function seek(event) {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !duration) return;
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  }

  return (
    <div className={compact ? 'player player-compact' : 'player'} data-testid="audio-player">
      <button
        type="button"
        className="player-toggle"
        onClick={togglePlayback}
        aria-label={isPlaying ? 'Pause' : 'Play'}
        style={{ background: accent }}
      >
        {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="player-play-icon" />}
      </button>

      <div className="player-wave-wrap">
        {peaks ? (
          <canvas ref={canvasRef} className="player-wave" onClick={seek} />
        ) : (
          <div className="player-wave player-wave-loading" aria-hidden="true">
            {Array.from({ length: 24 }).map((_, i) => (
              <span key={i} style={{ animationDelay: `${i * 45}ms` }} />
            ))}
          </div>
        )}
      </div>

      <div className="player-time" aria-live="off">
        {formatTime(currentTime)} <span className="t-muted">/ {formatTime(duration)}</span>
      </div>

      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
      />
    </div>
  );
}
