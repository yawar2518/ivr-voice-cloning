// frontend/src/hooks/useGenerateJob.js
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 240; // 8 minutes — long scripts take a while on the GPU

// Polls getGenerationStatus(jobId) until the job leaves "processing".
export function useGenerateJob(jobId) {
  const [status, setStatus] = useState(jobId ? 'processing' : null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [timedOut, setTimedOut] = useState(false);
  const pollCountRef = useRef(0);

  useEffect(() => {
    if (!jobId) {
      setStatus(null);
      setResult(null);
      setError(null);
      setTimedOut(false);
      return undefined;
    }

    let cancelled = false;
    let timeoutId;
    pollCountRef.current = 0;
    setStatus('processing');
    setResult(null);
    setError(null);
    setTimedOut(false);

    async function poll() {
      pollCountRef.current += 1;
      try {
        const res = await apiClient.getGenerationStatus(jobId);
        if (cancelled) return;
        setResult(res);
        setStatus(res.status);
        if (res.status === 'processing') {
          if (pollCountRef.current >= MAX_POLLS) {
            setTimedOut(true);
            return;
          }
          timeoutId = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err?.detail ?? 'Failed to check generation status.');
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [jobId]);

  return { status, result, error, timedOut };
}
