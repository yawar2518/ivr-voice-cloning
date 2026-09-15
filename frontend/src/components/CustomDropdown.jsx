// frontend/src/components/CustomDropdown.jsx
import { useEffect, useRef, useState } from 'react';
import './CustomDropdown.css';

// Generic single-select listbox styled to match the app's light glass
// theme. Replaces native <select> where a richer open/close and
// per-option entrance animation is wanted (Prompt Library status filter,
// Audit Log action filter).
// Menu stays mounted for MENU_CLOSE_MS after close so custom-dropdown-menu-out
// can play instead of the menu just vanishing.
const MENU_CLOSE_MS = 150;

export default function CustomDropdown({ options, value, onChange, placeholder = 'All' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMenuMounted, setIsMenuMounted] = useState(false);
  const rootRef = useRef(null);
  const closeTimerRef = useRef(null);

  function openMenu() {
    clearTimeout(closeTimerRef.current);
    setIsMenuMounted(true);
    setIsOpen(true);
  }

  function closeMenu() {
    setIsOpen(false);
    closeTimerRef.current = setTimeout(() => setIsMenuMounted(false), MENU_CLOSE_MS);
  }

  useEffect(() => () => clearTimeout(closeTimerRef.current), []);

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        closeMenu();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selected = options.find((opt) => opt.value === value);
  const selectedLabel = selected ? selected.label : placeholder;

  function handleSelect(optionValue) {
    onChange(optionValue);
    closeMenu();
  }

  return (
    <div className="custom-dropdown" ref={rootRef}>
      <button
        type="button"
        className="custom-dropdown-trigger"
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{selectedLabel}</span>
        <svg
          className={isOpen ? 'custom-dropdown-chevron custom-dropdown-chevron-open' : 'custom-dropdown-chevron'}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isMenuMounted && (
        <ul
          className={isOpen ? 'custom-dropdown-menu' : 'custom-dropdown-menu custom-dropdown-menu-closing'}
          role="listbox"
        >
          <li
            className={value === '' ? 'custom-dropdown-option custom-dropdown-option-active' : 'custom-dropdown-option'}
            role="option"
            aria-selected={value === ''}
            style={{ animationDelay: '0ms' }}
            onClick={() => handleSelect('')}
          >
            {placeholder}
          </li>
          {options.map((opt, index) => (
            <li
              key={opt.value}
              className={
                opt.value === value ? 'custom-dropdown-option custom-dropdown-option-active' : 'custom-dropdown-option'
              }
              role="option"
              aria-selected={opt.value === value}
              style={{ animationDelay: `${(index + 1) * 30}ms` }}
              onClick={() => handleSelect(opt.value)}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
