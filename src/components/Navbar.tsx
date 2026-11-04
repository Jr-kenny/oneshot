import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';

interface NavbarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
  onStartDemoRun?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentRoute,
  onNavigate,
  onStartDemoRun,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleRunDemo = () => {
    onNavigate('/demo');
    if (onStartDemoRun) {
      setTimeout(() => onStartDemoRun(), 50);
    }
    setMobileMenuOpen(false);
  };

  const navLinks = [
    { label: 'Demo', route: '/demo' },
    { label: 'How it works', route: '/how-it-works' },
    { label: 'Builders', route: '/builders' },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 h-14 bg-[#0A0E14] border-b border-[#1F2733]">
        <div className="max-w-[1440px] mx-auto h-full px-4 sm:px-6 flex items-center justify-between">
          {/* Brand Wordmark */}
          <button
            onClick={() => {
              onNavigate('/');
              setMobileMenuOpen(false);
            }}
            className="flex items-center gap-2 text-left group focus:outline-none"
            aria-label="OneShot home"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#F5A524] transition-transform group-hover:scale-110" />
            <span className="font-semibold text-lg tracking-tight text-[#E6EAF0]">
              OneShot
            </span>
          </button>

          {/* Desktop Nav Links */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Main Navigation">
            {navLinks.map((link) => (
              <button
                key={link.route}
                onClick={() => onNavigate(link.route)}
                className={`text-sm font-medium transition-colors ${
                  currentRoute === link.route
                    ? 'text-[#E6EAF0]'
                    : 'text-[#8A94A6] hover:text-[#E6EAF0]'
                }`}
              >
                {link.label}
              </button>
            ))}
          </nav>

          {/* Right Action */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunDemo}
              className="px-3.5 py-1.5 bg-[#E6EAF0] text-[#0A0E14] text-xs font-semibold rounded-[4px] hover:bg-white active:bg-gray-200 transition-colors cursor-pointer select-none"
            >
              Run chaos demo
            </button>

            {/* Mobile menu toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 text-[#8A94A6] hover:text-[#E6EAF0] md:hidden focus:outline-none"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer / Bottom sheet */}
      {mobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 top-14 z-40 bg-[#0A0E14]/95 backdrop-blur-sm md:hidden p-6 border-b border-[#1F2733] flex flex-col gap-4 animate-in fade-in"
        >
          <div className="flex flex-col gap-2">
            <button
              onClick={() => {
                onNavigate('/');
                setMobileMenuOpen(false);
              }}
              className={`text-left py-3 px-2 text-base font-medium rounded border-b border-[#1F2733]/60 ${
                currentRoute === '/' ? 'text-[#E6EAF0] bg-[#151B25]' : 'text-[#8A94A6]'
              }`}
            >
              Overview
            </button>
            {navLinks.map((link) => (
              <button
                key={link.route}
                onClick={() => {
                  onNavigate(link.route);
                  setMobileMenuOpen(false);
                }}
                className={`text-left py-3 px-2 text-base font-medium rounded border-b border-[#1F2733]/60 ${
                  currentRoute === link.route ? 'text-[#E6EAF0] bg-[#151B25]' : 'text-[#8A94A6]'
                }`}
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-[#1F2733] flex flex-col gap-2">
            <span className="text-xs font-mono uppercase text-[#8A94A6] tracking-wider">
              Network: NEAR Mainnet
            </span>
            <span className="text-xs font-mono text-[#8A94A6]">
              Contract: oneshot-guard.near
            </span>
          </div>
        </div>
      )}
    </>
  );
};
