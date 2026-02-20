'use client';

import { useState } from 'react';

export function FeedbackButton() {
  const [isHovered, setIsHovered] = useState(false);
  
  const feedbackEmail = 'matt@always-scheming.fyi';
  const subject = encodeURIComponent('AST Feedback');
  const body = encodeURIComponent(`Hey Matt,

Here's my feedback on the Always Scheming Terminal:

**What's useful:**


**What's confusing or noisy:**


**What's missing:**


Thanks!`);
  
  const mailtoUrl = `mailto:${feedbackEmail}?subject=${subject}&body=${body}`;

  return (
    <a
      href={mailtoUrl}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        fixed bottom-6 right-6 z-50
        flex items-center gap-2
        px-4 py-3 rounded-lg
        bg-ast-surface border border-ast-border
        text-ast-text hover:text-ast-accent
        hover:border-ast-accent
        transition-all duration-200
        shadow-lg hover:shadow-xl
        ${isHovered ? 'pr-5' : ''}
      `}
      title="Send feedback"
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width="18" 
        height="18" 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      <span className={`
        text-sm font-medium whitespace-nowrap
        transition-all duration-200
        ${isHovered ? 'opacity-100 w-auto' : 'opacity-0 w-0 overflow-hidden'}
      `}>
        Feedback
      </span>
    </a>
  );
}
