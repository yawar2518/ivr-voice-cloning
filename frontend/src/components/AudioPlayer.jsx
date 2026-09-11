// frontend/src/components/AudioPlayer.jsx
import { useEffect, useRef, useState } from 'react';
import ShinyButton from './ShinyButton';
import './AudioPlayer.css';

const WAVEFORM_BARS = 96;

function drawWaveform(canvas, peaks, progress) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const barWidth = width / peaks.length;
  const playedBars = Math.floor(peaks.length * progress);

  peaks.forEach((peak, i) => {
    const barHeight = Math.max(2, peak * height);
    const x = i * barWidth;
    const y = (height - barHeight) / 2;

    ctx.fillStyle = i < playedBars ? '#17151a' : 'rgba(23, 21, 26, 0.2)';
    ctx.fillRect(x, y, Math.max(1, barWidth - 1.5), barHeight);
  });
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function AudioPlayer({ audioUrl, durationSeconds }) {
  const audioRef = useRef(null);
  const canvasRef = useRef(null);

  const [peaks, setPeaks] = useState(null);
  const [waveformError, setWaveformError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPeaks(null);
    setWaveformError(null);

    async function loadWaveform() {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          throw new Error('Web Audio API not supported in this browser.');
        }

        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();
        const audioContext = new AudioContextClass();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioContext.close();

        if (cancelled) return;

        const channelData = audioBuffer.getChannelData(0);
        const blockSize = Math.floor(channelData.length / WAVEFORM_BARS) || 1;
        const nextPeaks = [];

        for (let i = 0; i < WAVEFORM_BARS; i++) {
          const start = i * blockSize;
          let max = 0;
          for (let j = 0; j < blockSize; j++) {
            const value = Math.abs(channelData[start + j] ?? 0);
            if (value > max) max = value;
          }
          nextPeaks.push(max);
        }

        setPeaks(nextPeaks);
      } catch (err) {
        if (cancelled) return;
        setWaveformError(err?.message ?? 'Failed to load waveform.');
      }
    }

    if (audioUrl) loadWaveform();

    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  useEffect(() => {
    if (!canvasRef.current || !peaks) return;
    const progress = durationSeconds ? currentTime / durationSeconds : 0;
    drawWaveform(canvasRef.current, peaks, progress);
  }, [peaks, currentTime, durationSeconds]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  }

  function handleWaveformClick(event) {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas || !durationSeconds) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * durationSeconds;
  }

  return (
    <div className="audio-player">
      <ShinyButton
        variant="icon"
        className="audio-player-toggle-shiny"
        onClick={togglePlayback}
        ariaLabel={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M7 5v14l12-7L7 5Z" />
          </svg>
        )}
      </ShinyButton>

      <div className="audio-player-waveform-wrap">
        {waveformError ? (
          <div className="audio-player-waveform-fallback">Waveform unavailable</div>
        ) : (
          <canvas
            ref={canvasRef}
            className="audio-player-waveform"
            onClick={handleWaveformClick}
          />
        )}
        <div className="audio-player-time">
          {formatTime(currentTime)} / {formatTime(durationSeconds)}
        </div>
      </div>

      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
      />
    </div>
  );
}
