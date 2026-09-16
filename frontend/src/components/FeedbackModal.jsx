// frontend/src/components/FeedbackModal.jsx
import { useState } from 'react';
import Modal from './Modal';
import { useUI } from '../context/UIContext';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'voiceclone.feedback';

export default function FeedbackModal() {
  const { closeFeedback } = useUI();
  const { showToast } = useToast();
  const { username, email } = useAuth();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    if (!message.trim()) return;
    setIsSending(true);

    const entry = {
      message: message.trim(),
      username,
      email,
      page: window.location.pathname,
      createdAt: new Date().toISOString()
    };
    console.info('[VoiceClone feedback]', entry);
    try {
      const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, entry]));
    } catch {
      // storage unavailable
    }

    setTimeout(() => {
      setIsSending(false);
      closeFeedback();
      showToast('Thanks for your feedback!', 'success');
    }, 350);
  }

  return (
    <Modal
      title="Send Feedback"
      subtitle="Help us improve VoiceClone"
      onClose={closeFeedback}
      width={480}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={closeFeedback} disabled={isSending}>
            Cancel
          </button>
          <button
            type="submit"
            form="feedback-form"
            className="btn btn-primary"
            disabled={!message.trim() || isSending}
          >
            {isSending && <span className="spinner" aria-hidden="true" />}
            Send Feedback
          </button>
        </>
      }
    >
      <form id="feedback-form" onSubmit={handleSubmit}>
        <textarea
          className="textarea"
          rows={5}
          autoFocus
          placeholder="What's on your mind? Report a bug or share an idea..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-label="Feedback"
        />
      </form>
    </Modal>
  );
}
