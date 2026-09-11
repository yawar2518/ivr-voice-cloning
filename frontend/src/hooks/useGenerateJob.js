// frontend/src/hooks/useGenerateJob.js
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '../api/client';

const POLL_INTERVAL_MS = 2000; // contract Section 9
const MAX_POLLS = 60; // contract Section 9

// Polls getGenerationStatus(jobId) until status leaves "processing" or
// MAX_POLLS is reached, per contract Section 9's polling contract table.
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
      return;
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
