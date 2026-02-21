'use client';

import { useState } from 'react';

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xbdyrbab';

export function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    formData.append('_subject', 'AST Feedback');

    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        setIsSubmitted(true);
        setTimeout(() => {
          setIsOpen(false);
          setIsSubmitted(false);
        }, 2000);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="
          fixed bottom-6 right-6 z-[9999]
          flex items-center gap-2
          px-4 py-3 rounded-lg
          bg-ast-accent text-ast-bg
          border-2 border-white
          hover:bg-ast-pink
          transition-all duration-200
          shadow-lg hover:shadow-xl
          group
        "
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
        <span className="text-sm font-medium opacity-0 w-0 overflow-hidden group-hover:opacity-100 group-hover:w-auto transition-all duration-200">
          Feedback
        </span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}
        >
          <div className="w-full max-w-md bg-ast-surface border border-ast-border rounded-lg shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-ast-border">
              <h2 className="text-lg font-semibold text-ast-text">Send Feedback</h2>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-ast-muted hover:text-ast-text transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            {/* Form */}
            {isSubmitted ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 bg-ast-accent/20 text-ast-accent rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <p className="text-ast-text font-medium">Thanks for your feedback!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-5 space-y-4">
                <input type="hidden" name="_source" value="AST Feedback Widget" />
                
                <div>
                  <label htmlFor="email" className="block text-sm text-ast-muted mb-1.5">
                    Email (optional)
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 bg-ast-bg border border-ast-border rounded-md text-ast-text placeholder:text-ast-muted/50 focus:outline-none focus:border-ast-accent transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="feedback" className="block text-sm text-ast-muted mb-1.5">
                    What&apos;s on your mind?
                  </label>
                  <textarea
                    id="feedback"
                    name="message"
                    required
                    rows={4}
                    placeholder="What's useful? What's confusing? What's missing?"
                    className="w-full px-3 py-2 bg-ast-bg border border-ast-border rounded-md text-ast-text placeholder:text-ast-muted/50 focus:outline-none focus:border-ast-accent transition-colors resize-none"
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-sm">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-ast-accent text-ast-bg font-medium rounded-md hover:bg-ast-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSubmitting ? 'Sending...' : 'Send Feedback'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
